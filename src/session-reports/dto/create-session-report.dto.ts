import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SESSION_REPORT_IMAGE_URL_PATTERN } from '../session-report-image.constants';
import { SESSION_REPORT_LIMITS } from '../session-report-limits';

export class CreateSessionReportDto {
  @IsUUID()
  sessionId!: string;

  /** Link ảnh chụp số liệu ca — lấy từ POST /session-reports/upload-image. Bắt buộc. */
  @IsString({ message: 'Chọn ảnh báo cáo' })
  @MaxLength(500)
  @Matches(SESSION_REPORT_IMAGE_URL_PATTERN, { message: 'Ảnh báo cáo không hợp lệ' })
  imageUrl!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày live phải là yyyy-MM-dd' })
  liveDate!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Nhập tên nhân sự' })
  @MaxLength(100, { message: 'Tên nhân sự tối đa 100 ký tự' })
  staffName!: string;

  @IsUUID('4', { message: 'Chọn ca live' })
  shiftId!: string;

  @IsUUID('4', { message: 'Chọn phân loại live' })
  liveTypeId!: string;

  @IsUUID('4', { message: 'Chọn team' })
  teamId!: string;

  @IsUUID('4', { message: 'Chọn kênh live' })
  channelId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Tổng giờ live không hợp lệ' })
  @Min(0, { message: 'Tổng giờ live phải >= 0' })
  @Max(SESSION_REPORT_LIMITS.totalHours, { message: 'Tổng giờ live tối đa 24 giờ' })
  totalHours!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Doanh thu không hợp lệ' })
  @Min(0, { message: 'Doanh thu phải >= 0' })
  @Max(SESSION_REPORT_LIMITS.revenue, { message: 'Doanh thu quá lớn' })
  revenue!: number;

  @Type(() => Number)
  @IsInt({ message: 'Số view phải là số nguyên' })
  @Min(0)
  @Max(SESSION_REPORT_LIMITS.count, { message: 'Số view quá lớn' })
  viewCount!: number;

  /** Thời gian giữ chân người xem, đơn vị GIÂY (cột "Tỷ lệ giữ chân khách hàng (giây)" của sheet). */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Tỷ lệ giữ chân không hợp lệ' })
  @Min(0)
  @Max(SESSION_REPORT_LIMITS.retentionSeconds, {
    message: 'Tỷ lệ giữ chân tối đa 999,99 giây',
  })
  retentionRate!: number;

  @Type(() => Number)
  @IsInt({ message: 'Tổng đơn phải là số nguyên' })
  @Min(0)
  @Max(SESSION_REPORT_LIMITS.count, { message: 'Tổng đơn quá lớn' })
  orderCount!: number;

  @Type(() => Number)
  @IsInt({ message: 'Lượt hiển thị phải là số nguyên' })
  @Min(0)
  @Max(SESSION_REPORT_LIMITS.count, { message: 'Lượt hiển thị quá lớn' })
  impressionCount!: number;
}
