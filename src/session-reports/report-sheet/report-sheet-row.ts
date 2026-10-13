import type { SessionReportWithLookups } from '../mappers/session-report.mapper';

/**
 * Một dòng của tab "BCDT T{tháng}/{năm}" trong file báo cáo tổng, đúng thứ tự cột B → N:
 * Ngày live · Tên · Ca live · Phân loại live · Giờ live · Team · Kênh · Tổng giờ live ·
 * Doanh thu · View · Tỷ lệ giữ chân (giây) · Tổng đơn · Lượt hiển thị.
 */
export interface ReportSheetRow {
  /** yyyy-MM-dd — Apps Script đổi thành ô ngày thật để công thức theo ngày của sheet cộng được. */
  readonly liveDate: string;
  readonly staffName: string;
  readonly shift: string;
  readonly liveType: string;
  readonly liveHours: string;
  readonly team: string;
  readonly channel: string;
  readonly totalHours: number;
  readonly revenue: number;
  readonly viewCount: number;
  readonly retentionSeconds: number;
  readonly orderCount: number;
  readonly impressionCount: number;
}

const SHIFT_WITH_HOURS = /^(.+?)\s*\((.+)\)\s*$/;

/**
 * Tên ca trong danh mục mang luôn khung giờ, vd "Sáng (9h - 13h)": cột "Ca live" lấy "Sáng",
 * cột "Giờ live" lấy "9h - 13h". Tên không có ngoặc thì "Giờ live" để trống.
 */
export function splitShiftName(name: string): { shift: string; liveHours: string } {
  const match = SHIFT_WITH_HOURS.exec(name.trim());
  if (!match) return { shift: name.trim(), liveHours: '' };
  return { shift: match[1].trim(), liveHours: match[2].trim() };
}

export function buildReportSheetRow(report: SessionReportWithLookups): ReportSheetRow {
  const { shift, liveHours } = splitShiftName(report.shift.name);
  return {
    liveDate: report.liveDate.toISOString().slice(0, 10),
    staffName: report.staffName,
    shift,
    liveType: report.liveType.name,
    liveHours,
    team: report.team.name,
    channel: report.channel.name,
    totalHours: report.totalHours.toNumber(),
    revenue: report.revenue.toNumber(),
    viewCount: report.viewCount,
    retentionSeconds: report.retentionRate.toNumber(),
    orderCount: report.orderCount,
    impressionCount: report.impressionCount,
  };
}
