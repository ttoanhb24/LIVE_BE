/// <reference types="jest" />

import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import type { ReportSheetRow } from '../src/session-reports/report-sheet/report-sheet-row';
import { ReportSheetClient } from '../src/session-reports/report-sheet/report-sheet.client';

const url = 'https://script.google.com/macros/s/fake/exec';
const row: ReportSheetRow = {
  liveDate: '2026-10-13',
  staffName: 'Ngọc Sơn',
  shift: 'Sáng',
  liveType: 'Live mới',
  liveHours: '9h - 13h',
  team: 'Team 1',
  channel: 'Shopee',
  totalHours: 4,
  revenue: 6500000,
  viewCount: 408,
  retentionSeconds: 24,
  orderCount: 2,
  impressionCount: 0,
  imageUrl: 'https://res.cloudinary.com/jsmkvfyg/image/upload/v1/LIVE_VCB/session-reports/abc.jpg',
};

function client(env: Record<string, string> = {}) {
  return new ReportSheetClient(new ConfigService(env));
}

const configured = { REPORT_SHEET_WEBHOOK_URL: url, REPORT_SHEET_WEBHOOK_SECRET: 's3cret' };

describe('Ghi báo cáo sang Google Sheet (appendRow)', () => {
  const post = jest.spyOn(axios, 'post');

  beforeEach(() => post.mockReset());

  it('chưa cấu hình URL/secret thì bỏ qua, không gọi mạng', async () => {
    expect(await client().appendRow(row)).toEqual({ status: 'skipped' });
    expect(post).not.toHaveBeenCalled();
  });

  it('gửi secret + action append + dòng báo cáo, trả tab và số dòng đã ghi', async () => {
    post.mockResolvedValue({ data: { ok: true, tab: 'BCDT T10/2026', row: 140 } });

    const result = await client(configured).appendRow(row);

    expect(result).toEqual({ status: 'synced', tab: 'BCDT T10/2026', row: 140 });
    expect(post).toHaveBeenCalledWith(
      url,
      { secret: 's3cret', action: 'append', row },
      expect.objectContaining({ timeout: 20_000 }),
    );
  });

  it('Apps Script báo lỗi (chưa có tab tháng) → failed kèm đúng câu lỗi, không throw', async () => {
    post.mockResolvedValue({
      data: { ok: false, error: 'Chưa có tab "BCDT T11/2026" trong file báo cáo' },
    });

    expect(await client(configured).appendRow(row)).toEqual({
      status: 'failed',
      message: 'Chưa có tab "BCDT T11/2026" trong file báo cáo',
    });
  });

  it('nhận về trang HTML (Web App chưa mở cho "Bất kỳ ai") → failed có gợi ý cách sửa', async () => {
    post.mockResolvedValue({ data: '<html>Sign in</html>' });

    const result = await client(configured).appendRow(row);

    expect(result).toEqual({
      status: 'failed',
      message: 'Apps Script không trả JSON — kiểm tra Web App đã để "Bất kỳ ai" truy cập',
    });
  });

  it('Google chậm quá hạn → failed "không phản hồi kịp"', async () => {
    post.mockRejectedValue(new AxiosError('timeout of 20000ms exceeded', 'ECONNABORTED'));

    expect(await client(configured).appendRow(row)).toEqual({
      status: 'failed',
      message: 'Google Sheet không phản hồi kịp',
    });
  });
});
