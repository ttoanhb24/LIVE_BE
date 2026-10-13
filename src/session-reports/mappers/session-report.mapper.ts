import type { Prisma } from '@prisma/client';

interface NamedLookup {
  id: string;
  name: string;
}

export interface SessionReportResponse {
  readonly id: string;
  readonly sessionId: string;
  readonly sessionName: string;
  readonly submittedById: string;
  readonly liveDate: string;
  readonly staffName: string;
  readonly shift: NamedLookup;
  readonly liveType: NamedLookup;
  readonly team: NamedLookup;
  readonly channel: NamedLookup;
  readonly totalHours: number;
  readonly revenue: number;
  readonly viewCount: number;
  readonly retentionRate: number;
  readonly orderCount: number;
  readonly impressionCount: number;
  /** null với báo cáo nộp trước khi form có ô ảnh. */
  readonly imageUrl: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type SessionReportWithLookups = Prisma.SessionReportGetPayload<{
  include: {
    shift: true;
    liveType: true;
    team: true;
    channel: true;
    session: { select: { id: true; name: true } };
  };
}>;

export function mapSessionReportToResponse(report: SessionReportWithLookups): SessionReportResponse {
  return {
    id: report.id,
    sessionId: report.sessionId,
    sessionName: report.session.name,
    submittedById: report.submittedById,
    liveDate: report.liveDate.toISOString().slice(0, 10),
    staffName: report.staffName,
    shift: { id: report.shift.id, name: report.shift.name },
    liveType: { id: report.liveType.id, name: report.liveType.name },
    team: { id: report.team.id, name: report.team.name },
    channel: { id: report.channel.id, name: report.channel.name },
    totalHours: report.totalHours.toNumber(),
    revenue: report.revenue.toNumber(),
    viewCount: report.viewCount,
    retentionRate: report.retentionRate.toNumber(),
    orderCount: report.orderCount,
    impressionCount: report.impressionCount,
    imageUrl: report.imageUrl,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}
