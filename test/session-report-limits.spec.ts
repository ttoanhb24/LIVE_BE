/// <reference types="jest" />

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSessionReportDto } from '../src/session-reports/dto/create-session-report.dto';

/** Đúng dạng FE gửi: các ô số là chuỗi. */
const valid = {
  sessionId: '55555555-5555-4555-8555-555555555555',
  liveDate: '2026-10-13',
  staffName: 'Ngọc Sơn',
  shiftId: '11111111-1111-4111-8111-111111111111',
  liveTypeId: '22222222-2222-4222-8222-222222222222',
  teamId: '33333333-3333-4333-8333-333333333333',
  channelId: '44444444-4444-4444-8444-444444444444',
  totalHours: '4',
  revenue: '19957700',
  viewCount: '5350',
  retentionRate: '20',
  orderCount: '11',
  impressionCount: '271340',
  imageUrl: 'https://res.cloudinary.com/jsmkvfyg/image/upload/v1/LIVE_VCB/session-reports/abc.jpg',
};

async function messages(patch: Record<string, string>): Promise<string[]> {
  const dto = plainToInstance(CreateSessionReportDto, { ...valid, ...patch });
  const errors = await validate(dto);
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('Giới hạn ô số báo cáo ca theo kiểu cột DB', () => {
  it('báo cáo hợp lệ không có lỗi', async () => {
    expect(await messages({})).toEqual([]);
  });

  it.each([
    ['revenue', '1000000000000', 'Doanh thu quá lớn'],
    ['viewCount', '3000000000', 'Số view quá lớn'],
    ['orderCount', '3000000000', 'Tổng đơn quá lớn'],
    ['impressionCount', '3000000000', 'Lượt hiển thị quá lớn'],
    ['totalHours', '25', 'Tổng giờ live tối đa 24 giờ'],
    ['retentionRate', '1000', 'Tỷ lệ giữ chân tối đa 999,99 giây'],
  ])('%s = %s bị chặn bằng câu dễ hiểu (trước đây lỗi 500)', async (field, value, message) => {
    expect(await messages({ [field]: value })).toContain(message);
  });

  it('giữ chân tính bằng giây: 120 giây hợp lệ (trước đây chặn > 100 vì hiểu là %)', async () => {
    expect(await messages({ retentionRate: '120' })).toEqual([]);
  });

  it('quá 2 chữ số thập phân vẫn bị chặn', async () => {
    expect(await messages({ totalHours: '4.333' })).toContain('Tổng giờ live không hợp lệ');
  });
});
