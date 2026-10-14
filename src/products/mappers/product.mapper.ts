import type { Prisma, Product, ProductVariant } from '@prisma/client';

export interface ProductVariantResponse {
  readonly id: string;
  readonly sku: string;
  readonly name: string | null;
  readonly price: string | null;
  readonly stock: number;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProductResponse {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly attributes: Prisma.JsonValue | null;
  readonly description: string | null;
  readonly images: string[];
  readonly videoUrl: string | null;
  readonly sapoId: string | null;
  readonly sapoUrl: string | null;
  readonly productType: string | null;
  readonly isActive: boolean;
  readonly variants: ProductVariantResponse[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

type ProductWithRelations = Product & {
  category: { name: string } | null;
  variants: ProductVariant[];
};

export function mapProductVariantToResponse(
  variant: ProductVariant,
): ProductVariantResponse {
  return {
    id: variant.id,
    sku: variant.sku,
    name: variant.name,
    price: variant.price?.toString() ?? null,
    stock: variant.stock,
    isActive: variant.isActive,
    createdAt: variant.createdAt.toISOString(),
    updatedAt: variant.updatedAt.toISOString(),
  };
}

export function mapProductToResponse(product: ProductWithRelations): ProductResponse {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? null,
    attributes: product.attributes,
    description: product.description,
    images: product.images,
    videoUrl: product.videoUrl,
    sapoId: product.sapoId,
    sapoUrl: product.sapoUrl,
    productType: product.productType,
    isActive: product.isActive,
    variants: product.variants.map(mapProductVariantToResponse),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export const productInclude = {
  category: { select: { name: true } },
  variants: { orderBy: { sku: 'asc' as const } },
} satisfies Prisma.ProductInclude;
