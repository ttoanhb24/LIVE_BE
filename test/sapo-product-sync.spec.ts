/// <reference types="jest" />

import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  productCodeFromSkus,
  SapoProductSyncService,
} from '../src/products/sapo-product-sync.service';

const configured = { SAPO_STORE: 'vcb', SAPO_API_KEY: 'key', SAPO_API_SECRET: 'secret' };
const sapo = (id: number, name: string, skus: string[]) => ({
  id,
  name,
  status: 'active',
  images: [],
  variants: skus.map((sku) => ({ sku, title: 'Default Title', price: 100 })),
});

function setup(env: Record<string, string> = configured) {
  const prisma = {
    product: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'p1',
          code: 'N100',
          sapoId: '1',
          name: 'Nhẫn cũ',
          images: [],
          isActive: true,
          variants: [],
        },
        {
          id: 'p9',
          code: 'X9',
          sapoId: '99',
          name: 'Đã xoá',
          images: [],
          isActive: true,
          variants: [],
        },
      ]),
      update: jest.fn((args) => args),
      createManyAndReturn: jest.fn().mockResolvedValue([{ id: 'p2', sapoId: '2' }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    productVariant: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new SapoProductSyncService(
    prisma as unknown as PrismaService,
    new ConfigService(env),
  );
  return { prisma, service };
}

describe('Đồng bộ sản phẩm từ Sapo', () => {
  const get = jest.spyOn(axios, 'get');
  beforeEach(() => get.mockReset());

  it('mã sản phẩm = SKU bỏ đuôi size', () => {
    expect(productCodeFromSkus(['N100886-7', 'N100886-8', 'N100886-95'])).toBe('N100886');
    expect(productCodeFromSkus(['TX219-27-B-02-M', 'TX219-27-B-03-M'])).toBe('TX219-27-B');
    expect(productCodeFromSkus(['D300'])).toBe('D300');
    expect(productCodeFromSkus(['ABC', 'XYZ'])).toBe('ABC');
  });

  it('nút bấm: tạo SP mới, cập nhật SP đổi, tên "Dừng bán" → ngưng, SP mất khỏi Sapo → ngưng', async () => {
    get.mockResolvedValue({
      data: {
        products: [sapo(1, 'Nhẫn Thủy tinh', ['N100-7']), sapo(2, '(DỪNG BÁN) Dây', ['D300'])],
      },
    });
    const { prisma, service } = setup();

    await service.run();

    expect(get).toHaveBeenCalledWith('https://vcb.mysapo.net/admin/products.json', {
      params: { page: 1, limit: 250 },
      auth: { username: 'key', password: 'secret' },
      timeout: 60_000,
    });
    expect(service.getStatus().result).toEqual({
      total: 2,
      created: 1,
      updated: 1,
      deactivated: 1,
    });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({ name: 'Nhẫn Thủy tinh', isActive: true }),
    });
    expect(prisma.product.createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ code: 'D300', isActive: false })],
      }),
    );
    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p9'] } },
      data: { isActive: false },
    });
  });

  it('cron đêm chỉ lấy SP có id lớn hơn id lớn nhất đã có, không ngưng bán SP cũ', async () => {
    get.mockResolvedValue({ data: { products: [sapo(120, 'Bông tai mới', ['B120'])] } });
    const { prisma, service } = setup();

    await service.run(true);

    expect(get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ params: { page: 1, limit: 250, since_id: 99 } }),
    );
    expect(service.getStatus().result).toEqual({
      total: 1,
      created: 1,
      updated: 0,
      deactivated: 0,
    });
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
  });

  it('chưa cấu hình Sapo → báo lỗi rõ, không gọi mạng', () => {
    // Giá trị rỗng chứ không bỏ trống: Prisma tự nạp .env máy dev vào process.env khi import.
    const { service } = setup({ SAPO_STORE: '', SAPO_API_KEY: '', SAPO_API_SECRET: '' });
    expect(() => service.start()).toThrow(BadRequestException);
    expect(get).not.toHaveBeenCalled();
  });
});
