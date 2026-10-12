import { UserRole } from '@prisma/client';

/**
 * Nhóm role — map quyền API (@Roles trên controller/handler).
 * DB / JWT vẫn giữ 3 enum: MEMBER | LEADER | ADMIN.
 *
 * ── Khi ADMIN khác LEADER ──
 * 1. Thêm constant, ví dụ:
 *      export const ADMIN_ONLY_ROLES = [UserRole.ADMIN] as const;
 * 2. Endpoint chỉ ADMIN:
 *      @Roles(...ADMIN_ONLY_ROLES)
 * 3. Endpoint LEADER + ADMIN (phần chung):
 *      @Roles(...STAFF_ROLES)  — hoặc thu hẹp STAFF_ROLES chỉ còn LEADER nếu cần.
 * 4. Đồng bộ FE: thêm group tương ứng trong `LIVE_FE/src/constants/roles.ts`.
 *
 * Không cần migrate DB hay đổi JWT payload.
 */
export const STAFF_ROLES = [UserRole.LEADER, UserRole.ADMIN] as const;

export const MEMBER_ROLES = [UserRole.MEMBER] as const;

export const ADMIN_ONLY_ROLES = [UserRole.ADMIN] as const;

/**
 * Mọi role đã đăng nhập. Dùng cho handler GET chỉ đọc trong controller đã gắn
 * @Roles(...STAFF_ROLES) ở cấp class: @Roles ở handler ghi đè class, nên MEMBER
 * xem được còn thêm/sửa/xóa vẫn chỉ STAFF.
 */
export const ALL_ROLES = [UserRole.MEMBER, UserRole.LEADER, UserRole.ADMIN] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
