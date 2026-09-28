import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  AssignEquipmentMotorDto,
  EditMotorDto,
} from './dto/equipment-motors.dto';
import { EquipmentMotorsService } from './equipment-motors.service';

const validation = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
@Controller('equipment-motors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class EquipmentMotorsController {
  constructor(private readonly motors: EquipmentMotorsService) {}
  @Get() list(
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
  ) {
    return this.motors.candidates(search, page);
  }
  @Get('compatible-equipment') equipment(
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page?: number,
  ) {
    return this.motors.candidates(search, page, true);
  }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) {
    return this.motors.get(id);
  }
  @Put('equipment/:id') assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validation) dto: AssignEquipmentMotorDto,
    @Req() req: { user: { sub: string } },
  ) {
    return this.motors.assign(id, dto, req.user.sub);
  }
  @Put(':id') edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validation) dto: EditMotorDto,
    @Req() req: { user: { sub: string } },
  ) {
    return this.motors.edit(id, dto, req.user.sub);
  }
}
