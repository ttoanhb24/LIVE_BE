/// <reference types="jest" />

import {
  buildReportSheetRow,
  splitShiftName,
} from '../src/session-reports/report-sheet/report-sheet-row';
import type { SessionReportWithLookups } from '../src/session-reports/mappers/session-report.mapper';

const decimal = (value: number) => ({ toNumber: () => value });

describe('splitShiftName', () => {
  it.each([
    ['Sáng (9h - 13h)', 'Sáng', '9h - 13h'],
    ['Chiều(13h - 17h)', 'Chiều', '13h - 17h'],
    ['  Tối  (18h - 22h)  ', 'Tối', '18h - 22h'],
    ['Tối', 'Tối', ''],
  ])('"%s" → ca "%s", giờ "%s"', (name, shift, liveHours) => {
    expect(splitShiftName(name)).toEqual({ shift, liveHours });
  });
});

describe('buildReportSheetRow', () => {
  it('đổ đủ 13 cột B → N theo thứ tự của tab BCDT', () => {
    const report = {
      liveDate: new Date('2026-10-13T00:00:00.000Z'),
      staffName: 'Ngọc Sơn',
      shift: { id: 's', name: 'Sáng (9h - 13h)' },
      liveType: { id: 'l', name: 'Live mới' },
      team: { id: 't', name: 'Team 1' },
      channel: { id: 'c', name: 'Huyk.xuongchetac2' },
      totalHours: decimal(4),
      revenue: decimal(19957700),
      viewCount: 5350,
      retentionRate: decimal(20),
      orderCount: 11,
      impressionCount: 271340,
    } as unknown as SessionReportWithLookups;

    expect(buildReportSheetRow(report)).toEqual({
      liveDate: '2026-10-13',
      staffName: 'Ngọc Sơn',
      shift: 'Sáng',
      liveType: 'Live mới',
      liveHours: '9h - 13h',
      team: 'Team 1',
      channel: 'Huyk.xuongchetac2',
      totalHours: 4,
      revenue: 19957700,
      viewCount: 5350,
      retentionSeconds: 20,
      orderCount: 11,
      impressionCount: 271340,
    });
  });
});
