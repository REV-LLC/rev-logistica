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
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  listEmployees() {
    return this.employeesService.listEmployees();
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
