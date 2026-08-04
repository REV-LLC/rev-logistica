import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProviderReturnsController } from './provider-returns.controller';
import { ProviderReturnsService } from './provider-returns.service';

@Module({ imports: [PrismaModule], controllers: [ProviderReturnsController], providers: [ProviderReturnsService] })
export class ProviderReturnsModule {}
