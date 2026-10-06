import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BulkKitsController } from './bulk-kits.controller';
import { BulkKitsService } from './bulk-kits.service';
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [BulkKitsController],
  providers: [BulkKitsService],
})
export class BulkKitsModule {}
