import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomersService } from './customers.service';
import {
  CUSTOMER_RUT_PDF_MAX_SIZE_BYTES,
  type CustomerRutPdfUpload,
} from './customer-rut-pdf-parser.service';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  list() {
    return this.customersService.list();
  }

  @Post('parse-rut')
  @Roles(Role.ADMIN, Role.OFFICE)
  @UseInterceptors(
    FileInterceptor('rut', {
      storage: memoryStorage(),
      limits: { fileSize: CUSTOMER_RUT_PDF_MAX_SIZE_BYTES },
    }),
  )
  parseRut(@UploadedFile() file?: CustomerRutPdfUpload) {
    return this.customersService.parseRutPdf(file);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  getById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.customersService.getById(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OFFICE)
  create(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateCustomerDto,
  ) {
    return this.customersService.create(payload);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OFFICE)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: UpdateCustomerDto,
  ) {
    return this.customersService.update(id, payload);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.OFFICE)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.customersService.remove(id);
  }

  @Get(':id/worksites')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  listWorksites(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.customersService.listWorksites(id);
  }
}
