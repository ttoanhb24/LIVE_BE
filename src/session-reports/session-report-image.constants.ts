/** Ảnh chụp màn hình số liệu ca — cùng trần 10MB như ảnh sản phẩm. */
export const SESSION_REPORT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export const SESSION_REPORT_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Thư mục con trong `CLOUDINARY_FOLDER`. */
export const SESSION_REPORT_IMAGE_PATH = 'session-reports';

/**
 * Chỉ nhận link ảnh do chính endpoint upload trả về (Cloudinary, https) — chặn việc gửi link
 * ảnh tuỳ ý từ nơi khác vào báo cáo và vào sheet.
 */
export const SESSION_REPORT_IMAGE_URL_PATTERN = /^https:\/\/res\.cloudinary\.com\/[^\s]+$/;

export interface SessionReportImageUploadResponse {
  imageUrl: string;
}
