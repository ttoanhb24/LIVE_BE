import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ALL_ROLES, Roles, STAFF_ROLES } from '../auth/decorators';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import type { ProductResponse } from './mappers/product.mapper';
import { PRODUCT_IMAGE_MAX_BYTES } from './product-image.constants';
import { ProductsService } from './products.service';

/** CRUD sản phẩm — ghi chỉ LEADER và ADMIN, MEMBER chỉ xem. */
@Controller('products')
@Roles(...STAFF_ROLES)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Roles(...ALL_ROLES)
  findAll(
    @Query() query: ListProductsQueryDto,
  ): Promise<PaginatedResponse<ProductResponse>> {
    return this.productsService.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateProductDto): Promise<ProductResponse> {
    return this.productsService.create(dto);
  }

  @Post('upload-image')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: PRODUCT_IMAGE_MAX_BYTES },
    }),
  )
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.productsService.uploadImage(file);
  }

  @Get(':id')
  @Roles(...ALL_ROLES)
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponse> {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponse> {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.productsService.remove(id);
  }
}
