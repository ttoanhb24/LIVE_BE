import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ALL_ROLES, CurrentUser, Roles } from '../auth/decorators';
import type { JwtPayloadUser } from '../auth/types';
import type { DailyRankingsResponse } from './daily-rankings';
import { CreateSessionReportDto } from './dto/create-session-report.dto';
import { DailyRankingsQueryDto } from './dto/daily-rankings-query.dto';
import { ListSessionReportsQueryDto } from './dto/list-session-reports-query.dto';
import { StaffNamesQueryDto } from './dto/staff-names-query.dto';
import {
  SESSION_REPORT_IMAGE_MAX_BYTES,
  type SessionReportImageUploadResponse,
} from './session-report-image.constants';
import {
  SessionReportsService,
  type CreateSessionReportResponse,
} from './session-reports.service';

/** Nhân sự nộp sau ca. Không gắn @Roles — MEMBER cũng gọi được. */
@Controller('session-reports')
export class SessionReportsController {
  constructor(private readonly sessionReportsService: SessionReportsService) {}

  @Get()
  @Roles(...ALL_ROLES)
  findAll(@Query() query: ListSessionReportsQueryDto) {
    return this.sessionReportsService.findAll(query);
  }

  @Get('daily-rankings')
  @Roles(...ALL_ROLES)
  dailyRankings(@Query() query: DailyRankingsQueryDto): Promise<DailyRankingsResponse> {
    return this.sessionReportsService.dailyRankings(query.from, query.to);
  }

  /** Danh sách tên cho form "Kết thúc ca" — cùng người nộp nên không gắn @Roles. */
  @Get('staff-names')
  staffNames(@Query() query: StaffNamesQueryDto): Promise<{ names: string[] }> {
    return this.sessionReportsService.staffNames(query.liveDate);
  }

  /** Ảnh chụp số liệu ca — cùng người nộp nên không gắn @Roles. */
  @Post('upload-image')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: SESSION_REPORT_IMAGE_MAX_BYTES },
    }),
  )
  uploadImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<SessionReportImageUploadResponse> {
    return this.sessionReportsService.uploadImage(file);
  }

  @Post()
  create(
    @Body() dto: CreateSessionReportDto,
    @CurrentUser() user: JwtPayloadUser,
  ): Promise<CreateSessionReportResponse> {
    return this.sessionReportsService.create(dto, user.id);
  }
}
