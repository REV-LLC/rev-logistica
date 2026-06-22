import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  listEmployees() {
    return this.employeesService.listEmployees();
  }

  @Get(':employeeId/photo')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  async getEmployeePhoto(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Res() response: Response,
  ) {
    const photo = await this.employeesService.getEmployeePhoto(employeeId);
    response.setHeader('Content-Type', photo.contentType);
    response.setHeader('Cache-Control', 'private, max-age=300');
    if (photo.contentLength !== undefined) {
      response.setHeader('Content-Length', String(photo.contentLength));
    }
    if (photo.etag) {
      response.setHeader('ETag', photo.etag);
    }
    photo.body.pipe(response);
  }

  @Post()
  createEmployee(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateEmployeeDto,
  ) {
    return this.employeesService.createEmployee(payload);
  }

  @Patch(':employeeId')
  updateEmployee(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: UpdateEmployeeDto,
  ) {
    return this.employeesService.updateEmployee(employeeId, payload);
  }

  @Delete(':employeeId')
  deleteEmployee(@Param('employeeId', new ParseUUIDPipe()) employeeId: string) {
    return this.employeesService.deleteEmployee(employeeId);
  }
}
