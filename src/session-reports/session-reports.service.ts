import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LiveLookupKind, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CloudinaryStorageService } from '../cloudinary/cloudinary-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { buildPaginatedMeta } from '../common/pagination/paginate';
import { buildDailyRankings, type DailyRankingsResponse } from './daily-rankings';
import { CreateSessionReportDto } from './dto/create-session-report.dto';
import { ListSessionReportsQueryDto } from './dto/list-session-reports-query.dto';
import {
  mapSessionReportToResponse,
  type SessionReportResponse,
} from './mappers/session-report.mapper';
import { buildReportSheetRow } from './report-sheet/report-sheet-row';
import { ReportSheetClient, type SheetSyncResult } from './report-sheet/report-sheet.client';
import {
  SESSION_REPORT_IMAGE_MAX_BYTES,
  SESSION_REPORT_IMAGE_MIMES,
  SESSION_REPORT_IMAGE_PATH,
  type SessionReportImageUploadResponse,
} from './session-report-image.constants';

/** Phản hồi khi nộp báo cáo: báo cáo đã lưu + kết quả chép sang Google Sheet. */
export type CreateSessionReportResponse = SessionReportResponse & {
  readonly sheetSync: SheetSyncResult;
};

function formatViDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

const reportInclude = {
  shift: true,
  liveType: true,
  team: true,
  channel: true,
  session: { select: { id: true, name: true } },
} satisfies Prisma.SessionReportInclude;

function liveDateRange(from?: string, to?: string): Prisma.SessionReportWhereInput {
  if (!from && !to) return {};
  return {
    liveDate: {
      ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
      ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}),
    },
  };
}

@Injectable()
export class SessionReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportSheet: ReportSheetClient,
    private readonly cloudinary: CloudinaryStorageService,
  ) {}

  /** Ảnh chụp số liệu ca — FE tải lên trước, lấy `imageUrl` gửi kèm khi nộp báo cáo. */
  async uploadImage(
    file: Express.Multer.File | undefined,
  ): Promise<SessionReportImageUploadResponse> {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn ảnh báo cáo');
    }
    if (
      !SESSION_REPORT_IMAGE_MIMES.includes(
        file.mimetype as (typeof SESSION_REPORT_IMAGE_MIMES)[number],
      )
    ) {
      throw new BadRequestException('Ảnh phải là JPG, PNG hoặc WEBP');
    }
    if (file.size > SESSION_REPORT_IMAGE_MAX_BYTES) {
      throw new BadRequestException('Ảnh không được lớn hơn 10MB');
    }

    const ext = file.originalname.includes('.')
      ? file.originalname.slice(file.originalname.lastIndexOf('.'))
      : '.jpg';
    const uploaded = await this.cloudinary.uploadObject(
      `${SESSION_REPORT_IMAGE_PATH}/${randomUUID()}${ext}`,
      file.buffer,
      file.mimetype,
    );
    return { imageUrl: uploaded.publicUrl };
  }

  async findAll(query: ListSessionReportsQueryDto): Promise<PaginatedResponse<SessionReportResponse>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SessionReportWhereInput = {
      ...(query.q ? { staffName: { contains: query.q, mode: 'insensitive' } } : {}),
      ...liveDateRange(query.from, query.to),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sessionReport.findMany({
        where,
        include: reportInclude,
        orderBy: [{ liveDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.sessionReport.count({ where }),
    ]);

    return {
      data: rows.map(mapSessionReportToResponse),
      meta: buildPaginatedMeta(page, limit, total),
    };
  }

  async dailyRankings(from?: string, to?: string): Promise<DailyRankingsResponse> {
    const groups = await this.prisma.sessionReport.groupBy({
      by: ['staffName'],
      where: liveDateRange(from, to),
      _sum: { revenue: true, viewCount: true },
      _avg: { retentionRate: true },
    });

    return buildDailyRankings(groups);
  }

  async create(
    dto: CreateSessionReportDto,
    submittedById: string,
  ): Promise<CreateSessionReportResponse> {
    const session = await this.prisma.liveSession.findUnique({
      where: { id: dto.sessionId },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên live');
    }

    const lookupNames = await this.ensureLookups(dto);
    const liveDate = new Date(`${dto.liveDate}T00:00:00.000Z`);
    await this.ensureNotSubmitted(dto, liveDate, lookupNames);

    const report = await this.prisma.sessionReport.create({
      data: {
        sessionId: dto.sessionId,
        submittedById,
        liveDate,
        staffName: dto.staffName,
        shiftId: dto.shiftId,
        liveTypeId: dto.liveTypeId,
        teamId: dto.teamId,
        channelId: dto.channelId,
        totalHours: new Prisma.Decimal(dto.totalHours),
        revenue: new Prisma.Decimal(dto.revenue),
        viewCount: dto.viewCount,
        retentionRate: new Prisma.Decimal(dto.retentionRate),
        orderCount: dto.orderCount,
        impressionCount: dto.impressionCount,
        imageUrl: dto.imageUrl,
      },
      include: reportInclude,
    });

    // Sau khi lưu DB mới chép sang sheet: sheet lỗi thì báo cáo vẫn còn, FE báo để nhập tay.
    const sheetSync = await this.reportSheet.appendRow(buildReportSheetRow(report));

    return { ...mapSessionReportToResponse(report), sheetSync };
  }

  /** Tên trong ô chọn cột "Tên" của sheet báo cáo — FE dùng làm danh sách chọn. */
  async staffNames(liveDate: string): Promise<{ names: string[] }> {
    return { names: await this.reportSheet.staffNames(liveDate) };
  }

  /**
   * Một người chỉ nộp một báo cáo cho mỗi (ngày, ca, kênh) — đúng một dòng như sheet báo cáo tổng.
   * Nộp lại sẽ nhân đôi doanh thu/view trên bảng xếp hạng và trên KPI của sheet.
   */
  private async ensureNotSubmitted(
    dto: CreateSessionReportDto,
    liveDate: Date,
    lookupNames: Map<string, string>,
  ): Promise<void> {
    const existing = await this.prisma.sessionReport.findFirst({
      where: {
        liveDate,
        shiftId: dto.shiftId,
        channelId: dto.channelId,
        staffName: { equals: dto.staffName, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        `${dto.staffName} đã nộp báo cáo ca ${lookupNames.get(dto.shiftId)} kênh ` +
          `${lookupNames.get(dto.channelId)} ngày ${formatViDate(dto.liveDate)}`,
      );
    }
  }

  /** Kiểm 4 danh mục đúng loại; trả `id → tên` để dùng trong thông báo lỗi. */
  private async ensureLookups(dto: CreateSessionReportDto): Promise<Map<string, string>> {
    const expected = new Map<string, LiveLookupKind>([
      [dto.shiftId, LiveLookupKind.SHIFT],
      [dto.liveTypeId, LiveLookupKind.LIVE_TYPE],
      [dto.teamId, LiveLookupKind.TEAM],
      [dto.channelId, LiveLookupKind.CHANNEL],
    ]);

    const rows = await this.prisma.liveLookup.findMany({
      where: { id: { in: [...expected.keys()] } },
      select: { id: true, kind: true, name: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row.kind]));

    for (const [id, kind] of expected) {
      if (byId.get(id) !== kind) {
        throw new BadRequestException('Ca, phân loại, team hoặc kênh không hợp lệ');
      }
    }

    return new Map(rows.map((row) => [row.id, row.name]));
  }
}
