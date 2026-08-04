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
import { CustomersService } from './customers.service';
import { CreateWorksiteDto } from './dto/create-worksite.dto';
import { UpdateWorksiteDto } from './dto/update-worksite.dto';
import { ValidateWorksiteAddressDto } from './dto/validate-worksite-address.dto';
import { WorksiteAddressValidationService } from './worksite-address-validation.service';

@Controller('worksites')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class WorksitesController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly addressValidationService: WorksiteAddressValidationService,
  ) {}

  @Get()
  list() {
    return this.customersService.listAllWorksites();
  }

  @Get('driver-directory')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  listDriverDirectory() {
    return this.customersService.listDriverWorksiteDirectory();
  }

  @Post()
  create(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateWorksiteDto,
  ) {
    return this.customersService.createWorksite(payload);
  }

  @Post('address/validate')
  validateAddress(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: ValidateWorksiteAddressDto,
  ) {
    return this.addressValidationService.validate(payload);
  }

  @Patch(':customerWorksiteId')
  update(
    @Param('customerWorksiteId', new ParseUUIDPipe()) customerWorksiteId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: UpdateWorksiteDto,
  ) {
    return this.customersService.updateWorksite(customerWorksiteId, payload);
  }

  @Delete(':customerWorksiteId')
  remove(@Param('customerWorksiteId', new ParseUUIDPipe()) customerWorksiteId: string) {
    return this.customersService.removeWorksite(customerWorksiteId);
  }
}
