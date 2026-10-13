/// <reference types="jest" />

import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LiveLookupKind } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportSheetClient } from '../src/session-reports/report-sheet/report-sheet.client';
import { SessionReportsService } from '../src/session-reports/session-reports.service';

const shiftId = '11111111-1111-4111-8111-111111111111';
const liveTypeId = '22222222-2222-4222-8222-222222222222';
const teamId = '33333333-3333-4333-8333-333333333333';
const channelId = '44444444-4444-4444-8444-444444444444';
const sessionId = '55555555-5555-4555-8555-555555555555';

const dto = {
  sessionId,
  liveDate: '2026-10-13',
  staffName: 'Ngọc Sơn',
  shiftId,
  liveTypeId,
  teamId,
  channelId,
  totalHours: 4,
  revenue: 19957700,
  viewCount: 5350,
  retentionRate: 20,
  orderCount: 11,
  impressionCount: 271340,
};

describe('Chặn nộp trùng báo cáo ca', () => {
  let service: SessionReportsService;

  const prisma = {
    liveSession: { findUnique: jest.fn() },
    liveLookup: { findMany: jest.fn() },
    sessionReport: { findFirst: jest.fn(), create: jest.fn() },
  };
  const reportSheet = { appendRow: jest.fn(), staffNames: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.liveSession.findUnique.mockResolvedValue({ id: sessionId });
    prisma.liveLookup.findMany.mockResolvedValue([
      { id: shiftId, kind: LiveLookupKind.SHIFT, name: 'Sáng (9h - 13h)' },
      { id: liveTypeId, kind: LiveLookupKind.LIVE_TYPE, name: 'Live mới' },
      { id: teamId, kind: LiveLookupKind.TEAM, name: 'Team 1' },
      { id: channelId, kind: LiveLookupKind.CHANNEL, name: 'Huyk.xuongchetac2' },
    ]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        SessionReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReportSheetClient, useValue: reportSheet },
      ],
    }).compile();
    service = moduleRef.get(SessionReportsService);
  });

  it('cùng người, cùng ngày, cùng ca, cùng kênh → 409, không lưu DB, không ghi sheet', async () => {
    prisma.sessionReport.findFirst.mockResolvedValue({ id: 'existing' });

    const promise = service.create(dto, 'user-1');

    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toThrow(
      'Ngọc Sơn đã nộp báo cáo ca Sáng (9h - 13h) kênh Huyk.xuongchetac2 ngày 13/10/2026',
    );
    expect(prisma.sessionReport.create).not.toHaveBeenCalled();
    expect(reportSheet.appendRow).not.toHaveBeenCalled();
  });

  it('so tên không phân biệt hoa/thường, theo đúng ngày + ca + kênh', async () => {
    prisma.sessionReport.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(service.create(dto, 'user-1')).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.sessionReport.findFirst).toHaveBeenCalledWith({
      where: {
        liveDate: new Date('2026-10-13T00:00:00.000Z'),
        shiftId,
        channelId,
        staffName: { equals: 'Ngọc Sơn', mode: 'insensitive' },
      },
      select: { id: true },
    });
  });

  it('chưa nộp thì lưu bình thường', async () => {
    prisma.sessionReport.findFirst.mockResolvedValue(null);
    prisma.sessionReport.create.mockRejectedValue(new Error('đã tới bước lưu'));

    await expect(service.create(dto, 'user-1')).rejects.toThrow('đã tới bước lưu');
    expect(prisma.sessionReport.create).toHaveBeenCalledTimes(1);
  });
});
