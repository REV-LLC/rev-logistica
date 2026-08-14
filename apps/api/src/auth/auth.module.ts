import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { resolveJwtSecret } from './jwt-config';

const resolveJwtExpiresIn = (value?: string): number | StringValue =>
  value
    ? Number.isFinite(Number(value))
      ? Number(value)
      : (value as StringValue)
    : ('8h' as StringValue);

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: {
        expiresIn: resolveJwtExpiresIn(process.env.JWT_EXPIRES_IN),
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtModule, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
