import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import axios, { isAxiosError } from 'axios';
import { PrismaService } from '../prisma/prisma.service';

const PAGE_SIZE = 250;
/** Sapo để status "active" cho mọi SP — ngưng bán chỉ thấy qua tên. "Thủy" cũng chứa "hủy" nên bắt trong ngoặc. */
const DISCONTINUED = /dừng bán|\((hủy|huỷ)\)/iu;

interface SapoProduct {
  id: number;
  name: string;
  status: string;
  product_type: string | null;
  images: { src: string; position: number }[];
  variants: { sku: string | null; title: string | null; price: number }[];
}

type SyncResult = { total: number; created: number; updated: number; deactivated: number };

export interface SapoSyncStatus {
  running: boolean;
  result: SyncResult | null;
  error: string | null;
}

/** SKU bỏ đuôi size: N100886-7, N100886-8 → N100886. Một SKU thì giữ nguyên. */
export function productCodeFromSkus(skus: string[]): string | null {
  if (skus.length <= 1) return skus[0] ?? null;
  const parts = skus.map((sku) => sku.split('-'));
  let n = 0;
  while (parts.every((p) => n < p.length - 1 && p[n] === parts[0][n])) n++;
  return n > 0 ? parts[0].slice(0, n).join('-') : skus[0];
}

const variantsKey = (variants: { sku: string; name: string | null; price: unknown }[]) =>
  variants
    .map((v) => `${v.sku}|${v.name}|${Number(v.price)}`)
    .sort()
    .join();

/**
 * Kéo SP từ Sapo về, khớp theo sapoId: tên, ảnh, đang bán, biến thể (SKU, tên, giá).
 * Nút bấm quét toàn bộ; cron 23:59 chỉ lấy SP mới (id Sapo tăng dần → since_id).
 */
@Injectable()
export class SapoProductSyncService {
  private readonly logger = new Logger(SapoProductSyncService.name);
  private status: SapoSyncStatus = { running: false, result: null, error: null };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  getStatus(): SapoSyncStatus {
    return this.status;
  }

  /** Chạy nền rồi trả ngay — FE hỏi lại GET tới khi xong. Đang chạy thì không chạy chồng. */
  start(): SapoSyncStatus {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        'Chưa cấu hình Sapo (SAPO_STORE, SAPO_API_KEY, SAPO_API_SECRET)',
      );
    }
    if (!this.status.running) void this.run();
    return this.status;
  }

  @Cron('0 59 23 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async nightly(): Promise<void> {
    if (this.isConfigured() && !this.status.running) await this.run(true);
  }

  async run(onlyNew = false): Promise<void> {
    this.status = { running: true, result: null, error: null };
    try {
      this.status = { running: false, result: await this.sync(onlyNew), error: null };
    } catch (error) {
      const message = isAxiosError(error)
        ? `Sapo trả lỗi ${error.response?.status ?? error.code}`
        : (error as Error).message;
      this.status = { running: false, result: null, error: message };
      this.logger.error(`Đồng bộ Sapo thất bại: ${message}`);
    }
  }

  private async sync(onlyNew: boolean): Promise<SyncResult> {
    const all = await this.prisma.product.findMany({
      select: {
        id: true,
        code: true,
        sapoId: true,
        name: true,
        images: true,
        isActive: true,
        productType: true,
        variants: { select: { sku: true, name: true, price: true } },
      },
    });
    const synced = all.filter((p) => p.sapoId);
    const bySapoId = new Map(synced.map((p) => [p.sapoId, p]));
    const usedCodes = new Set(all.map((p) => p.code));
    const skuOwner = new Map(all.flatMap((p) => p.variants.map((v) => [v.sku, p.sapoId ?? p.id])));
    const sinceId = onlyNew ? Math.max(0, ...synced.map((p) => Number(p.sapoId))) : 0;
    const seen = new Set<string>();
    const result: SyncResult = { total: 0, created: 0, updated: 0, deactivated: 0 };

    for (let page = 1; ; page++) {
      const products = await this.fetchPage(page, sinceId);
      const toCreate: Prisma.ProductCreateManyInput[] = [];
      const newVariants = new Map<
        string,
        Omit<Prisma.ProductVariantCreateManyInput, 'productId'>[]
      >();

      for (const sapo of products) {
        const sapoId = String(sapo.id);
        const name = sapo.name.normalize('NFC').trim();
        const data = {
          name,
          sapoId,
          sapoUrl: `https://${this.cfg('SAPO_STORE')}.mysapo.net/admin/products/${sapoId}`,
          isActive: sapo.status === 'active' && !DISCONTINUED.test(name),
          productType: sapo.product_type?.trim() || null,
          images: [...sapo.images].sort((a, b) => a.position - b.position).map((i) => i.src),
        };
        // SKU duy nhất toàn bảng: bỏ SKU trùng trong SP hoặc đang thuộc SP khác, nếu không
        // DB bỏ qua mà lần sau so lại vẫn thấy "khác" → cập nhật mãi.
        const variants = sapo.variants
          .map((v) => ({
            sku: v.sku?.trim() ?? '',
            name: v.title && v.title !== 'Default Title' ? v.title.trim() : null,
            price: v.price,
          }))
          .filter(
            (v, i, list) =>
              v.sku &&
              (skuOwner.get(v.sku) ?? sapoId) === sapoId &&
              list.findIndex((x) => x.sku === v.sku) === i,
          );
        variants.forEach((v) => skuOwner.set(v.sku, sapoId));
        seen.add(sapoId);

        const old = bySapoId.get(sapoId);
        if (!old) {
          const skus = variants.map((v) => v.sku);
          toCreate.push({ ...data, code: this.newCode(skus, sapoId, usedCodes) });
          newVariants.set(sapoId, variants);
          continue;
        }
        if (
          old.name === name &&
          old.isActive === data.isActive &&
          old.productType === data.productType &&
          old.images.join() === data.images.join() &&
          variantsKey(old.variants) === variantsKey(variants)
        ) {
          continue;
        }
        await this.prisma.$transaction([
          this.prisma.product.update({ where: { id: old.id }, data }),
          this.prisma.productVariant.deleteMany({ where: { productId: old.id } }),
          this.prisma.productVariant.createMany({
            data: variants.map((v) => ({ ...v, productId: old.id })),
            skipDuplicates: true,
          }),
        ]);
        result.updated++;
      }

      if (toCreate.length > 0) {
        const created = await this.prisma.product.createManyAndReturn({
          data: toCreate,
          select: { id: true, sapoId: true },
          skipDuplicates: true,
        });
        await this.prisma.productVariant.createMany({
          data: created.flatMap((p) =>
            (newVariants.get(p.sapoId!) ?? []).map((v) => ({ ...v, productId: p.id })),
          ),
          skipDuplicates: true,
        });
        result.created += created.length;
      }
      result.total += products.length;
      if (products.length < PAGE_SIZE) break;
    }

    // Chỉ lượt quét toàn bộ mới biết SP nào đã mất khỏi Sapo → ngưng bán, không xóa
    // (có thể đã gắn block nội dung / phiên live).
    if (!onlyNew) {
      const gone = synced.filter((p) => p.isActive && !seen.has(p.sapoId!)).map((p) => p.id);
      const { count } = await this.prisma.product.updateMany({
        where: { id: { in: gone } },
        data: { isActive: false },
      });
      result.deactivated = count;
    }
    this.logger.log(`Đồng bộ Sapo xong: ${JSON.stringify(result)}`);
    return result;
  }

  /** Mã trùng SP khác thì lùi về SKU đầu, rồi SAPO-<id>. */
  private newCode(skus: string[], sapoId: string, usedCodes: Set<string>): string {
    const code =
      [productCodeFromSkus(skus), skus[0]].find((c): c is string => !!c && !usedCodes.has(c)) ??
      `SAPO-${sapoId}`;
    usedCodes.add(code);
    return code;
  }

  private async fetchPage(page: number, sinceId: number, attempt = 1): Promise<SapoProduct[]> {
    try {
      const { data } = await axios.get<{ products: SapoProduct[] }>(
        `https://${this.cfg('SAPO_STORE')}.mysapo.net/admin/products.json`,
        {
          params: { page, limit: PAGE_SIZE, ...(sinceId > 0 ? { since_id: sinceId } : {}) },
          auth: { username: this.cfg('SAPO_API_KEY'), password: this.cfg('SAPO_API_SECRET') },
          timeout: 60_000,
        },
      );
      return data.products ?? [];
    } catch (error) {
      // Sapo giới hạn tần suất gọi — gặp 429 thì chờ rồi thử lại.
      if (attempt >= 5 || !isAxiosError(error) || error.response?.status !== 429) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      return this.fetchPage(page, sinceId, attempt + 1);
    }
  }

  private cfg(key: string): string {
    return this.config.get<string>(key)?.trim() ?? '';
  }

  private isConfigured(): boolean {
    return Boolean(
      this.cfg('SAPO_STORE') && this.cfg('SAPO_API_KEY') && this.cfg('SAPO_API_SECRET'),
    );
  }
}
