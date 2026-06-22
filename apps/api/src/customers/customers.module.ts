import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { WorksiteAddressValidationService } from './worksite-address-validation.service';
import { WorksitesController } from './worksites.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CustomersController, WorksitesController],
  providers: [CustomersService, WorksiteAddressValidationService],
})
export class CustomersModule {}
