/**
 * Trần của từng ô số trong báo cáo ca, theo đúng kiểu cột Postgres. Vượt trần mà không chặn ở
 * DTO thì Prisma ném lỗi tràn số → filter chung đổi thành "không kết nối được cơ sở dữ liệu",
 * người dùng hiểu sai nguyên nhân. FE (`session-report-form.schema.ts`) dùng cùng các con số này.
 */
export const SESSION_REPORT_LIMITS = {
  /** Một ca không quá 24 giờ (cột `total_hours` Decimal(6,2)). */
  totalHours: 24,
  /** Cột `revenue` Decimal(14,2). */
  revenue: 999_999_999_999.99,
  /** Thời gian giữ chân người xem, đơn vị GIÂY như sheet báo cáo (cột `retention_rate` Decimal(5,2)). */
  retentionSeconds: 999.99,
  /** Cột Int (int4) của view / đơn / lượt hiển thị. */
  count: 2_147_483_647,
} as const;
