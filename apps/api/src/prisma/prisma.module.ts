import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { IdempotencyService } from '../common/idempotency.service';

@Global()
@Module({
  providers: [PrismaService, IdempotencyService],
  exports: [PrismaService, IdempotencyService],
})
export class PrismaModule {}
