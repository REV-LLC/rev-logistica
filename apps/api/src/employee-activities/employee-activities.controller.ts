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
import {
  ActivityNoteDto,
  ReviewActivityDto,
  ReviewActivityBatchDto,
} from './employee-activities.dto';
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

  @Patch(':employeeId/review-batch')
  reviewBatch(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    payload: ReviewActivityBatchDto,
    @Req() request: { user: { sub: string } },
  ) {
    return this.service.reviewBatch(employeeId, payload.ids, request.user.sub);
  }

  @Patch(':employeeId/:id/review')
  review(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    payload: ReviewActivityDto,
    @Req() request: { user: { sub: string } },
  ) {
    return this.service.review(
      employeeId,
      id,
      payload.action,
      request.user.sub,
    );
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
    @Req() request: { user: { sub: string } },
  ) {
    return this.service.update(employeeId, id, payload, request.user.sub);
  }

  @Delete(':employeeId/:id')
  remove(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: { user: { sub: string } },
  ) {
    return this.service.remove(employeeId, id, request.user.sub);
  }
}
