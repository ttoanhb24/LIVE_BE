import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { SapoProductSyncService } from './sapo-product-sync.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, SapoProductSyncService],
  exports: [ProductsService],
})
export class ProductsModule {}
