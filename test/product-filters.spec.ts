/// <reference types="jest" />

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import type { CloudinaryStorageService } from '../src/cloudinary/cloudinary-storage.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ListProductsQueryDto } from '../src/products/dto/list-products-query.dto';
import { ProductsService } from '../src/products/products.service';

function setup() {
  const prisma = {
    product: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([[], 0]),
  };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    {} as CloudinaryStorageService,
  );
  return { prisma, service };
}

describe('Bộ lọc trang Sản phẩm', () => {
  it('lọc theo trạng thái, nhóm loại (cả "NHẪN >> …") và khoảng giá biến thể', async () => {
    const { prisma, service } = setup();

    await service.findAll({
      page: 1,
      limit: 20,
      isActive: true,
      productType: 'NHẪN',
      minPrice: 1000,
      maxPrice: 5000,
    });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { isActive: true },
            {
              OR: [
                { productType: { equals: 'NHẪN', mode: 'insensitive' } },
                { productType: { startsWith: 'NHẪN >>', mode: 'insensitive' } },
              ],
            },
            { variants: { some: { price: { gte: 1000, lte: 5000 } } } },
          ],
        },
      }),
    );
  });

  it('?isActive=false trên URL ra đúng false (trước đây bị đổi thành true)', () => {
    const query = plainToInstance(
      ListProductsQueryDto,
      { isActive: 'false', minPrice: '1000' },
      { enableImplicitConversion: true },
    );
    expect(query.isActive).toBe(false);
    expect(query.minPrice).toBe(1000);
  });

  it('danh sách loại: nhóm đứng trước các loại của nó, gộp loại lệch hoa/thường', async () => {
    const { prisma, service } = setup();
    prisma.product.findMany.mockResolvedValue([
      { productType: 'NHẪN >> Vàng' },
      { productType: 'ĐÁ QUÝ' },
      { productType: 'NHẪN >> Bạc' },
      { productType: 'NHẪN >> bạc' },
    ]);

    expect(await service.listProductTypes()).toEqual([
      'ĐÁ QUÝ',
      'NHẪN',
      'NHẪN >> bạc',
      'NHẪN >> Vàng',
    ]);
  });
});
