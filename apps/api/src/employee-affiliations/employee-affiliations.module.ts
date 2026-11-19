import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { EmployeeAffiliationsService } from './employee-affiliations.service';
import { EmployeeAffiliationsController } from './employee-affiliations.controller';
@Module({ imports: [PrismaModule, AuthModule], providers: [EmployeeAffiliationsService], controllers: [EmployeeAffiliationsController] })
export class EmployeeAffiliationsModule {}
