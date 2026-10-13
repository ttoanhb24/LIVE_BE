/// <reference types="jest" />

import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ReportSheetClient } from '../src/session-reports/report-sheet/report-sheet.client';

const configured = {
  REPORT_SHEET_WEBHOOK_URL: 'https://script.google.com/macros/s/fake/exec',
  REPORT_SHEET_WEBHOOK_SECRET: 's3cret',
};

describe('Danh sách tên nhân sự lấy từ sheet (staffNames)', () => {
  const post = jest.spyOn(axios, 'post');

  beforeEach(() => post.mockReset());

  it('chưa cấu hình thì trả rỗng để FE cho gõ tay', async () => {
    const client = new ReportSheetClient(new ConfigService({}));

    expect(await client.staffNames('2026-10-13')).toEqual([]);
    expect(post).not.toHaveBeenCalled();
  });

  it('lấy tên theo tháng của ngày live và giữ 5 phút, sang tháng khác thì hỏi lại', async () => {
    const client = new ReportSheetClient(new ConfigService(configured));
    post
      .mockResolvedValueOnce({ data: { ok: true, staffNames: ['Ngọc Sơn', 'Duy Nam'] } })
      .mockResolvedValueOnce({ data: { ok: true, staffNames: ['Quỳnh Anh'] } });

    expect(await client.staffNames('2026-10-13')).toEqual(['Ngọc Sơn', 'Duy Nam']);
    expect(await client.staffNames('2026-10-20')).toEqual(['Ngọc Sơn', 'Duy Nam']);
    expect(await client.staffNames('2026-11-01')).toEqual(['Quỳnh Anh']);

    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenNthCalledWith(
      1,
      configured.REPORT_SHEET_WEBHOOK_URL,
      { secret: 's3cret', action: 'staffNames', liveDate: '2026-10-13' },
      expect.any(Object),
    );
  });

  it('sheet trả danh sách rỗng thì không giữ lại — sửa sheet xong form thấy tên ngay', async () => {
    const client = new ReportSheetClient(new ConfigService(configured));
    post
      .mockResolvedValueOnce({ data: { ok: true, staffNames: [], nameRule: 'NONE' } })
      .mockResolvedValueOnce({ data: { ok: true, staffNames: ['Ngọc Sơn'], nameRule: 'TABLE' } });

    expect(await client.staffNames('2026-10-13')).toEqual([]);
    expect(await client.staffNames('2026-10-13')).toEqual(['Ngọc Sơn']);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('sheet lỗi thì trả rỗng (không chặn form) và lần sau hỏi lại', async () => {
    const client = new ReportSheetClient(new ConfigService(configured));
    post
      .mockResolvedValueOnce({ data: { ok: false, error: 'Chưa có tab "BCDT T10/2026"' } })
      .mockResolvedValueOnce({ data: { ok: true, staffNames: ['Ngọc Sơn'] } });

    expect(await client.staffNames('2026-10-13')).toEqual([]);
    expect(await client.staffNames('2026-10-13')).toEqual(['Ngọc Sơn']);
  });
});
