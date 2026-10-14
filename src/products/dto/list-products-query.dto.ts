import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListProductsQueryDto extends PaginationQueryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  // Đọc chuỗi gốc từ `obj`: enableImplicitConversion đã đổi "false" thành true trước khi tới đây.
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    if (obj.isActive === 'true') return true;
    if (obj.isActive === 'false') return false;
    return obj.isActive;
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Nhóm ("NHẪN") hoặc loại đầy đủ ("NHẪN >> Bạc"). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  productType?: string;

  /** Có ít nhất một biến thể giá trong khoảng. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;
}
