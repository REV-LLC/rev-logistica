import { AnnexSourceService } from './annex-source.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AnnexesController } from './annexes.controller';
import { AnnexesService } from './annexes.service';
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AnnexesController],
  providers: [AnnexesService, AnnexSourceService],
})
export class AnnexesModule {}
