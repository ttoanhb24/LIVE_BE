import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CloudinaryStorageService } from '../cloudinary/cloudinary-storage.service';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { buildPaginatedMeta } from '../common/pagination/paginate';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MIMES,
  type ProductImageUploadResponse,
} from './product-image.constants';
import {
  mapProductToResponse,
  productInclude,
  type ProductResponse,
} from './mappers/product.mapper';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryStorageService,
  ) {}

  async findAll(query: ListProductsQueryDto): Promise<PaginatedResponse<ProductResponse>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = this.buildWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: rows.map(mapProductToResponse),
      meta: buildPaginatedMeta(page, limit, total),
    };
  }

  /** Danh sách cho bộ lọc Loại: mỗi nhóm ("NHẪN") đứng trước các loại của nó ("NHẪN >> Bạc"). */
  async listProductTypes(): Promise<string[]> {
    const rows = await this.prisma.product.findMany({
      where: { productType: { not: null } },
      distinct: ['productType'],
      select: { productType: true },
    });
    const options = rows.flatMap(({ productType: type }) =>
      type!.includes('>>') ? [type!.split('>>')[0].trim(), type!] : [type!],
    );
    // Chuẩn hóa lệch hoa/thường ("Bạc trang sức" / "Bạc Trang sức") — lọc không phân biệt nên gộp một.
    const unique = new Map(options.map((o) => [o.toLocaleLowerCase('vi'), o]));
    return [...unique.values()].sort((a, b) => a.localeCompare(b, 'vi'));
  }

  async findOne(id: string): Promise<ProductResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }
    return mapProductToResponse(product);
  }

  async create(dto: CreateProductDto): Promise<ProductResponse> {
    await this.ensureCategoryExists(dto.categoryId);
    this.ensureUniqueVariantSkus(dto.variants);

    try {
      const product = await this.prisma.product.create({
        data: {
          code: dto.code,
          name: dto.name,
          categoryId: dto.categoryId ?? null,
          ...(dto.attributes !== undefined
            ? { attributes: dto.attributes as Prisma.InputJsonValue }
            : {}),
          description: dto.description ?? null,
          images: dto.images ?? [],
          videoUrl: dto.videoUrl ?? null,
          sapoId: dto.sapoId ?? null,
          sapoUrl: dto.sapoUrl ?? null,
          isActive: dto.isActive ?? true,
          variants: dto.variants?.length
            ? { create: dto.variants.map((variant) => this.mapVariantCreateData(variant)) }
            : undefined,
        },
        include: productInclude,
      });
      return mapProductToResponse(product);
    } catch (error) {
      this.rethrowPrismaError(error, 'create');
      throw error;
    }
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductResponse> {
    await this.ensureExists(id);
    await this.ensureCategoryExists(dto.categoryId);
    this.ensureUniqueVariantSkus(dto.variants);

    try {
      const product = await this.prisma.$transaction(async (tx) => {
        if (dto.variants !== undefined) {
          await tx.productVariant.deleteMany({ where: { productId: id } });
        }

        return tx.product.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.categoryId !== undefined
              ? {
                  category: dto.categoryId
                    ? { connect: { id: dto.categoryId } }
                    : { disconnect: true },
                }
              : {}),
            ...(dto.attributes !== undefined
              ? { attributes: dto.attributes as Prisma.InputJsonValue }
              : {}),
            ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
            ...(dto.images !== undefined ? { images: dto.images } : {}),
            ...(dto.videoUrl !== undefined ? { videoUrl: dto.videoUrl ?? null } : {}),
            ...(dto.sapoId !== undefined ? { sapoId: dto.sapoId ?? null } : {}),
            ...(dto.sapoUrl !== undefined ? { sapoUrl: dto.sapoUrl ?? null } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
            ...(dto.variants !== undefined
              ? {
                  variants: {
                    create: dto.variants.map((variant) => this.mapVariantCreateData(variant)),
                  },
                }
              : {}),
          },
          include: productInclude,
        });
      });

      return mapProductToResponse(product);
    } catch (error) {
      this.rethrowPrismaError(error, 'update');
      throw error;
    }
  }

  async uploadImage(file: Express.Multer.File | undefined): Promise<ProductImageUploadResponse> {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn ảnh để tải lên');
    }

    if (!PRODUCT_IMAGE_MIMES.includes(file.mimetype as (typeof PRODUCT_IMAGE_MIMES)[number])) {
      throw new BadRequestException('Ảnh phải là JPG, PNG, WEBP hoặc GIF');
    }

    if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
      throw new BadRequestException('Ảnh không được lớn hơn 10MB');
    }

    const ext = file.originalname.includes('.')
      ? file.originalname.slice(file.originalname.lastIndexOf('.'))
      : '.jpg';
    const storagePath = `products/${randomUUID()}${ext}`;

    const uploaded = await this.cloudinary.uploadObject(
      storagePath,
      file.buffer,
      file.mimetype,
    );

    return { imageUrl: uploaded.publicUrl };
  }

  async remove(id: string): Promise<void> {
    await this.ensureExists(id);

    const [blockCount, segmentCount] = await this.prisma.$transaction([
      this.prisma.scriptBlock.count({ where: { productId: id } }),
      this.prisma.sessionSegment.count({ where: { productId: id } }),
    ]);

    if (blockCount > 0) {
      throw new ConflictException('Không thể xóa sản phẩm đang có kịch bản gắn theo');
    }
    if (segmentCount > 0) {
      throw new ConflictException('Không thể xóa sản phẩm đang có trong phiên live');
    }

    try {
      await this.prisma.product.delete({ where: { id } });
    } catch (error) {
      this.rethrowPrismaError(error, 'remove');
      throw error;
    }
  }

  private buildWhere(query: ListProductsQueryDto): Prisma.ProductWhereInput {
    const filters: Prisma.ProductWhereInput[] = [];

    if (query.q) {
      filters.push({
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { code: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }

    if (query.categoryId) {
      filters.push({ categoryId: query.categoryId });
    }

    if (query.isActive !== undefined) {
      filters.push({ isActive: query.isActive });
    }

    // Chọn nhóm "NHẪN" thì ra cả "NHẪN >> Bạc", "NHẪN >> Vàng"…; chọn loại đầy đủ thì đúng loại đó.
    if (query.productType) {
      filters.push({
        OR: [
          { productType: { equals: query.productType, mode: 'insensitive' } },
          { productType: { startsWith: `${query.productType} >>`, mode: 'insensitive' } },
        ],
      });
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      filters.push({
        variants: { some: { price: { gte: query.minPrice, lte: query.maxPrice } } },
      });
    }

    if (filters.length === 0) return {};
    if (filters.length === 1) return filters[0]!;
    return { AND: filters };
  }

  private mapVariantCreateData(variant: CreateProductVariantDto) {
    return {
      sku: variant.sku,
      name: variant.name ?? null,
      price: variant.price !== undefined ? new Prisma.Decimal(variant.price) : null,
      stock: variant.stock ?? 0,
      isActive: variant.isActive ?? true,
    };
  }

  private ensureUniqueVariantSkus(variants?: CreateProductVariantDto[]): void {
    if (!variants?.length) return;

    const skus = variants.map((variant) => variant.sku);
    if (new Set(skus).size !== skus.length) {
      throw new BadRequestException('SKU biến thể không được trùng nhau');
    }
  }

  private async ensureCategoryExists(categoryId?: string): Promise<void> {
    if (!categoryId) return;

    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục');
    }
  }

  private async ensureExists(id: string): Promise<void> {
    const exists = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }
  }

  private rethrowPrismaError(
    error: unknown,
    action: 'create' | 'update' | 'remove',
  ): void {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return;

    if (error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(',')
        : String(error.meta?.target ?? '');

      if (target.includes('sku')) {
        throw new ConflictException('SKU biến thể đã tồn tại');
      }
      if (target.includes('sapo_id')) {
        throw new ConflictException('Sapo ID đã được liên kết với sản phẩm khác');
      }
      throw new ConflictException('Mã sản phẩm đã tồn tại');
    }

    if (error.code === 'P2025') {
      throw new NotFoundException('Không tìm thấy sản phẩm');
    }

    if (action === 'remove' && error.code === 'P2003') {
      throw new ConflictException('Không thể xóa sản phẩm đang được sử dụng');
    }
  }
}
