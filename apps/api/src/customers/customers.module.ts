import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerRutPdfParserService } from './customer-rut-pdf-parser.service';
import { WorksiteAddressValidationService } from './worksite-address-validation.service';
import { WorksitesController } from './worksites.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CustomersController, WorksitesController],
  providers: [CustomersService, CustomerRutPdfParserService, WorksiteAddressValidationService],
})
export class CustomersModule {}
