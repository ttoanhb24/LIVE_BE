import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ALL_ROLES, Roles, STAFF_ROLES } from '../auth/decorators';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { CreateLiveSessionDto } from './dto/create-live-session.dto';
import { ListLiveSessionsQueryDto } from './dto/list-live-sessions-query.dto';
import { LiveSessionsService } from './live-sessions.service';
import type {
  LiveSessionDetailResponse,
  LiveSessionListResponse,
} from './mappers/live-session.mapper';

/**
 * LiveSessionsController là một controller để xử lý các yêu cầu liên quan đến live session
 */
@Controller('live-sessions')
@Roles(...STAFF_ROLES)
export class LiveSessionsController {
  constructor(private readonly liveSessionsService: LiveSessionsService) {}

  @Get()
  @Roles(...ALL_ROLES)
  findAll(
    @Query() query: ListLiveSessionsQueryDto,
  ): Promise<PaginatedResponse<LiveSessionListResponse>> {
    return this.liveSessionsService.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateLiveSessionDto): Promise<LiveSessionDetailResponse> {
    return this.liveSessionsService.create(dto);
  }

  @Get(':id')
  @Roles(...ALL_ROLES)
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<LiveSessionDetailResponse> {
    return this.liveSessionsService.findOne(id);
  }

  @Post(':id/regenerate')
  regenerate(@Param('id', ParseUUIDPipe) id: string): Promise<LiveSessionDetailResponse> {
    return this.liveSessionsService.regenerate(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.liveSessionsService.remove(id);
  }
}
