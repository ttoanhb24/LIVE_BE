/// <reference types="jest" />

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LiveLookupKind } from '@prisma/client';
import { CloudinaryStorageService } from '../src/cloudinary/cloudinary-storage.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportSheetClient } from '../src/session-reports/report-sheet/report-sheet.client';
import { SessionReportsService } from '../src/session-reports/session-reports.service';

const decimal = (value: number) => ({ toNumber: () => value });

const shiftId = '11111111-1111-4111-8111-111111111111';
const liveTypeId = '22222222-2222-4222-8222-222222222222';
const teamId = '33333333-3333-4333-8333-333333333333';
const channelId = '44444444-4444-4444-8444-444444444444';
const sessionId = '55555555-5555-4555-8555-555555555555';

const inputDto = {
  sessionId,
  liveDate: '2026-10-08',
  staffName: 'Lan',
  shiftId,
  liveTypeId,
  teamId,
  channelId,
  totalHours: 4.5,
  revenue: 12000000,
  viewCount: 300,
  retentionRate: 42.5,
  orderCount: 15,
  impressionCount: 8000,
  imageUrl: 'https://res.cloudinary.com/jsmkvfyg/image/upload/v1/LIVE_VCB/session-reports/abc.jpg',
};

const lookups = [
  { id: shiftId, kind: LiveLookupKind.SHIFT, name: 'Tối' },
  { id: liveTypeId, kind: LiveLookupKind.LIVE_TYPE, name: 'Live mới' },
  { id: teamId, kind: LiveLookupKind.TEAM, name: 'Team 1' },
  { id: channelId, kind: LiveLookupKind.CHANNEL, name: 'Facebook' },
];

describe('SessionReportsService', () => {
  let service: SessionReportsService;

  const prisma = {
    liveSession: { findUnique: jest.fn() },
    liveLookup: { findMany: jest.fn() },
    sessionReport: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const reportSheet = { appendRow: jest.fn(), staffNames: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.sessionReport.findFirst.mockResolvedValue(null);
    reportSheet.appendRow.mockResolvedValue({ status: 'skipped' });
    const moduleRef = await Test.createTestingModule({
      providers: [
        SessionReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReportSheetClient, useValue: reportSheet },
        { provide: CloudinaryStorageService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(SessionReportsService);
  });

  it('creates a report when the session and lookups match', async () => {
    reportSheet.appendRow.mockResolvedValue({ status: 'synced', tab: 'BCDT T10/2026', row: 140 });
    prisma.liveSession.findUnique.mockResolvedValue({ id: sessionId });
    prisma.liveLookup.findMany.mockResolvedValue(lookups);
    prisma.sessionReport.create.mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      submittedById: 'user-1',
      ...inputDto,
      liveDate: new Date('2026-10-08T00:00:00.000Z'),
      totalHours: decimal(4.5),
      revenue: decimal(12000000),
      retentionRate: decimal(42.5),
      createdAt: new Date('2026-10-08T12:00:00.000Z'),
      updatedAt: new Date('2026-10-08T12:00:00.000Z'),
      shift: { id: shiftId, name: 'Tối' },
      liveType: { id: liveTypeId, name: 'Live mới' },
      team: { id: teamId, name: 'Team 1' },
      channel: { id: channelId, name: 'Facebook' },
      session: { id: sessionId, name: 'Live tối' },
    });

    const actual = await service.create(inputDto, 'user-1');

    expect(actual.sessionName).toBe('Live tối');
    expect(actual.staffName).toBe('Lan');
    expect(actual.shift.name).toBe('Tối');
    expect(actual.revenue).toBe(12000000);
    expect(actual.sheetSync).toEqual({ status: 'synced', tab: 'BCDT T10/2026', row: 140 });
    expect(prisma.sessionReport.create).toHaveBeenCalledTimes(1);
    expect(reportSheet.appendRow).toHaveBeenCalledWith(
      expect.objectContaining({ liveDate: '2026-10-08', staffName: 'Lan', channel: 'Facebook' }),
    );
  });

  it('lists reports newest live date first', async () => {
    const row = {
      id: '66666666-6666-4666-8666-666666666666',
      submittedById: 'user-1',
      ...inputDto,
      liveDate: new Date('2026-10-08T00:00:00.000Z'),
      totalHours: decimal(4.5),
      revenue: decimal(12000000),
      retentionRate: decimal(42.5),
      createdAt: new Date('2026-10-08T12:00:00.000Z'),
      updatedAt: new Date('2026-10-08T12:00:00.000Z'),
      shift: { id: shiftId, name: 'Tối' },
      liveType: { id: liveTypeId, name: 'Live mới' },
      team: { id: teamId, name: 'Team 1' },
      channel: { id: channelId, name: 'Facebook' },
      session: { id: sessionId, name: 'Live tối' },
    };
    prisma.$transaction.mockResolvedValue([[row], 1]);

    const actual = await service.findAll({ page: 1, limit: 20 });

    expect(actual.data).toHaveLength(1);
    expect(actual.data[0]?.staffName).toBe('Lan');
    expect(actual.meta.total).toBe(1);
  });

  it('filters by live date range', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.findAll({ page: 1, limit: 20, from: '2026-10-01', to: '2026-10-08' });

    expect(prisma.sessionReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          liveDate: {
            gte: new Date('2026-10-01T00:00:00.000Z'),
            lte: new Date('2026-10-08T00:00:00.000Z'),
          },
        },
      }),
    );
  });

  it('ranks the day by revenue, views, and average retention', async () => {
    prisma.sessionReport.groupBy.mockResolvedValue([
      {
        staffName: 'Mai',
        _sum: { revenue: decimal(20000000), viewCount: 500 },
        _avg: { retentionRate: decimal(70) },
      },
      {
        staffName: 'Lan',
        _sum: { revenue: decimal(20000000), viewCount: 100 },
        _avg: { retentionRate: decimal(40) },
      },
      {
        staffName: 'Hoa',
        _sum: { revenue: decimal(5000000), viewCount: 200 },
        _avg: { retentionRate: decimal(70) },
      },
    ]);

    const actual = await service.dailyRankings('2026-10-01', '2026-10-09');

    expect(prisma.sessionReport.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['staffName'],
        where: {
          liveDate: {
            gte: new Date('2026-10-01T00:00:00.000Z'),
            lte: new Date('2026-10-09T00:00:00.000Z'),
          },
        },
      }),
    );
    expect(actual.revenue.map((row) => row.staffName)).toEqual(['Lan', 'Mai', 'Hoa']);
    expect(actual.traffic.map((row) => row.staffName)).toEqual(['Mai', 'Hoa', 'Lan']);
    expect(actual.retention.map((row) => row.staffName)).toEqual(['Hoa', 'Mai', 'Lan']);
    expect(actual.revenue[0]).toEqual({ rank: 1, staffName: 'Lan', value: 20000000 });
    expect(actual.traffic[0]?.value).toBe(500);
    expect(actual.retention[0]?.value).toBe(70);
  });

  it('returns empty rankings when nobody submitted that day', async () => {
    prisma.sessionReport.groupBy.mockResolvedValue([]);

    const actual = await service.dailyRankings();

    expect(prisma.sessionReport.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
    expect(actual).toEqual({ revenue: [], traffic: [], retention: [] });
  });

  it('throws when the session does not exist', async () => {
    prisma.liveSession.findUnique.mockResolvedValue(null);

    await expect(service.create(inputDto, 'user-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sessionReport.create).not.toHaveBeenCalled();
  });

  it('throws when a lookup is the wrong kind', async () => {
    prisma.liveSession.findUnique.mockResolvedValue({ id: sessionId });
    prisma.liveLookup.findMany.mockResolvedValue(
      lookups.map((row) =>
        row.id === channelId ? { ...row, kind: LiveLookupKind.TEAM } : row,
      ),
    );

    await expect(service.create(inputDto, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.sessionReport.create).not.toHaveBeenCalled();
  });
});
