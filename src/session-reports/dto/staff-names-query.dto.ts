import { Matches } from 'class-validator';

export class StaffNamesQueryDto {
  /** Ngày live đang chọn trên form — quyết định đọc tab tháng nào của sheet. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày live phải là yyyy-MM-dd' })
  liveDate!: string;
}
