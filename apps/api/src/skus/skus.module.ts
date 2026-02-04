import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SkusController } from './skus.controller';
import { SkusService } from './skus.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SkusController],
  providers: [SkusService],
})
export class SkusModule {}
