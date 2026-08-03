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
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';
import type { EmployeePhotoFile } from './employees.service';

const MAX_PROFILE_PHOTO_SIZE_BYTES = 2 * 1024 * 1024;

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
    response.setHeader('Cache-Control', 'private, max-age=14400');
    if (photo.contentLength !== undefined) {
      response.setHeader('Content-Length', String(photo.contentLength));
    }
    if (photo.etag) {
      response.setHeader('ETag', photo.etag);
    }
    photo.body.pipe(response);
  }

  @Post(':employeeId/photo')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PROFILE_PHOTO_SIZE_BYTES },
    }),
  )
  uploadEmployeePhoto(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @UploadedFile() file?: EmployeePhotoFile,
  ) {
    return this.employeesService.uploadEmployeePhoto(employeeId, file);
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
