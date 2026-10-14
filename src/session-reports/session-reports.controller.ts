import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ALL_ROLES, CurrentUser, Roles } from '../auth/decorators';
import type { JwtPayloadUser } from '../auth/types';
import type { DailyRankingsResponse } from './daily-rankings';
import { CreateSessionReportDto } from './dto/create-session-report.dto';
import { DailyRankingsQueryDto } from './dto/daily-rankings-query.dto';
import { ListSessionReportsQueryDto } from './dto/list-session-reports-query.dto';
import type { SessionReportResponse } from './mappers/session-report.mapper';
import { SessionReportsService } from './session-reports.service';

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

  @Post()
  create(
    @Body() dto: CreateSessionReportDto,
    @CurrentUser() user: JwtPayloadUser,
  ): Promise<SessionReportResponse> {
    return this.sessionReportsService.create(dto, user.id);
  }
}
