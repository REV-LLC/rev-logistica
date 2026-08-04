import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({ imports: [PrismaModule, AuthModule], controllers: [SettingsController], providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
