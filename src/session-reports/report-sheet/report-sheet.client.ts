import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { isAxiosError } from 'axios';
import type { ReportSheetRow } from './report-sheet-row';

/** Apps Script thường trả trong 2–5 giây; lần gọi đầu sau một lúc nghỉ có thể tới ~10 giây. */
const REQUEST_TIMEOUT_MS = 20_000;
/** Danh sách tên trên sheet ít đổi — giữ 5 phút để mỗi lần mở form không phải gọi Google. */
const STAFF_NAMES_TTL_MS = 5 * 60_000;

export type SheetSyncResult =
  | { readonly status: 'synced'; readonly tab: string; readonly row: number }
  | { readonly status: 'skipped' }
  | { readonly status: 'failed'; readonly message: string };

interface WebhookResponse {
  ok?: boolean;
  error?: string;
  tab?: string;
  row?: number;
  staffNames?: string[];
  /** Loại luật ô chọn cột "Tên" script đọc được — chỉ để chẩn đoán khi danh sách rỗng. */
  nameRule?: string;
}

/**
 * Gọi Web App Apps Script gắn trong file báo cáo tổng (`scripts/google-sheet/report-webhook.gs`).
 * Cấu hình bằng `REPORT_SHEET_WEBHOOK_URL` + `REPORT_SHEET_WEBHOOK_SECRET`; thiếu một trong hai thì
 * bỏ qua việc ghi sheet, báo cáo vẫn lưu DB như cũ.
 */
@Injectable()
export class ReportSheetClient {
  private readonly logger = new Logger(ReportSheetClient.name);
  private readonly staffNamesCache = new Map<string, { names: string[]; expiresAt: number }>();

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.url() && this.secret());
  }

  /** Ghi một dòng báo cáo. Không throw: báo cáo đã lưu DB, sheet chỉ là bản chép cho đội vận hành. */
  async appendRow(row: ReportSheetRow): Promise<SheetSyncResult> {
    if (!this.isConfigured()) return { status: 'skipped' };
    try {
      const data = await this.call('append', { row });
      return { status: 'synced', tab: data.tab ?? '', row: data.row ?? 0 };
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.error(`Ghi sheet báo cáo thất bại (${row.staffName} ${row.liveDate}): ${message}`);
      return { status: 'failed', message };
    }
  }

  /** Tên trong ô chọn cột "Tên" của tab tháng. Chưa cấu hình hoặc lỗi thì trả rỗng để FE cho gõ tay. */
  async staffNames(liveDate: string): Promise<string[]> {
    if (!this.isConfigured()) return [];
    const month = liveDate.slice(0, 7);
    const cached = this.staffNamesCache.get(month);
    if (cached && cached.expiresAt > Date.now()) return cached.names;

    try {
      const data = await this.call('staffNames', { liveDate });
      const names = data.staffNames ?? [];
      if (names.length === 0) {
        // Không giữ danh sách rỗng: sửa sheet / script xong là form phải thấy tên ngay.
        this.logger.warn(
          `Sheet trả danh sách tên rỗng (tab ${data.tab}, luật ô chọn cột Tên: ${data.nameRule ?? '?'})`,
        );
        return names;
      }
      this.staffNamesCache.set(month, { names, expiresAt: Date.now() + STAFF_NAMES_TTL_MS });
      return names;
    } catch (error) {
      this.logger.warn(`Không lấy được danh sách tên từ sheet: ${this.errorMessage(error)}`);
      return [];
    }
  }

  private async call(action: string, payload: object): Promise<WebhookResponse> {
    // Apps Script trả 302 sang googleusercontent; axios tự đi theo và đổi thành GET.
    const { data } = await axios.post<WebhookResponse | string>(
      this.url(),
      { secret: this.secret(), action, ...payload },
      { timeout: REQUEST_TIMEOUT_MS },
    );
    if (!data || typeof data !== 'object') {
      // Thường là trang đăng nhập Google: Web App chưa để "Bất kỳ ai" được truy cập.
      throw new Error('Apps Script không trả JSON — kiểm tra Web App đã để "Bất kỳ ai" truy cập');
    }
    if (!data.ok) throw new Error(data.error || 'Apps Script báo lỗi');
    return data;
  }

  private errorMessage(error: unknown): string {
    if (isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') return 'Google Sheet không phản hồi kịp';
      return `Không gọi được Apps Script (${error.response?.status ?? error.code ?? 'lỗi mạng'})`;
    }
    return error instanceof Error ? error.message : String(error);
  }

  private url(): string {
    return this.config.get<string>('REPORT_SHEET_WEBHOOK_URL')?.trim() ?? '';
  }

  private secret(): string {
    return this.config.get<string>('REPORT_SHEET_WEBHOOK_SECRET')?.trim() ?? '';
  }
}
