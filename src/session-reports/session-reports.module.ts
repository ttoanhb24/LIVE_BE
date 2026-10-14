import { Module } from '@nestjs/common';
import { ReportSheetClient } from './report-sheet/report-sheet.client';
import { SessionReportsController } from './session-reports.controller';
import { SessionReportsService } from './session-reports.service';

@Module({
  controllers: [SessionReportsController],
  providers: [SessionReportsService, ReportSheetClient],
})
export class SessionReportsModule {}
