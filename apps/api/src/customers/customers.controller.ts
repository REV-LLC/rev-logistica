import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomersService } from './customers.service';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  list() {
    return this.customersService.list();
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
