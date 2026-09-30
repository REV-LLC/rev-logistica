import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ActivityNoteDto } from './employee-activities.dto';
import { EmployeeActivitiesService } from './employee-activities.service';

@Controller('employee-activities')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class EmployeeActivitiesController {
  constructor(private readonly service: EmployeeActivitiesService) {}

  @Get('options')
  options() {
    return this.service.options();
  }

  @Get(':employeeId')
  list(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Query('month') month: string,
  ) {
    return this.service.list(employeeId, month);
  }

  @Post(':employeeId')
  create(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: ActivityNoteDto,
    @Req() request: { user: { sub: string } },
  ) {
    return this.service.create(employeeId, payload, request.user.sub);
  }

  @Patch(':employeeId/:id')
  update(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: ActivityNoteDto,
  ) {
    return this.service.update(employeeId, id, payload);
  }

  @Delete(':employeeId/:id')
  remove(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.remove(employeeId, id);
  }
}
