import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OwnersController } from './owners.controller';
import { OwnersService } from './owners.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OwnersController],
  providers: [OwnersService],
})
export class OwnersModule {}
