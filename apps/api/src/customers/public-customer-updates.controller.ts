import { Body, Controller, Get, Param, Patch, ValidationPipe } from '@nestjs/common';
import { PublicCustomerUpdateDto } from './dto/public-customer-update.dto';
import { CustomersService } from './customers.service';

@Controller('public/customer-updates')
export class PublicCustomerUpdatesController {
  constructor(private readonly customersService: CustomersService) {}

  @Get(':token')
  get(@Param('token') token: string) {
    return this.customersService.getPublicUpdate(token);
  }

  @Patch(':token')
  update(
    @Param('token') token: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })) payload: PublicCustomerUpdateDto,
  ) {
    return this.customersService.applyPublicUpdate(token, payload);
  }
}
