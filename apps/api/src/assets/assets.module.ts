import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AssetFamiliesController } from './asset-families.controller';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AssetsController, AssetFamiliesController],
  providers: [AssetsService],
})
export class AssetsModule {}
