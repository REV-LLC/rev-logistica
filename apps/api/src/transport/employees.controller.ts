import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
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
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.WAREHOUSE_TABLET)
  listEmployees() {
    return this.employeesService.listEmployees();
  }

  @Get(':employeeId')
  getEmployeeProfile(@Param('employeeId', new ParseUUIDPipe()) employeeId: string) {
    return this.employeesService.getEmployeeProfile(employeeId);
  }

  @Get(':employeeId/photo')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.OPERATOR, Role.WAREHOUSE_TABLET)
  async getEmployeePhoto(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Query('variant') variant: string | undefined,
    @Res() response: Response,
    @Req() request: { user: { sub: string; role: Role } },
  ) {
    if (request.user.role === Role.OPERATOR && await this.employeesService.ownEmployeeId(request.user.sub) !== employeeId) {
      throw new ForbiddenException('Solo puedes consultar tu propia foto.');
    }
    const photo = await this.employeesService.getEmployeePhoto(
      employeeId,
      variant === 'thumbnail',
    );
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
  async createEmployee(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateEmployeeDto,
    @Req() request: { user: { sub: string } },
  ) {
    const actorRole = await this.employeesService.assertEmployeeManagement(request.user.sub, payload);
    return this.employeesService.createEmployee({ ...payload, payrollEnabled: actorRole === Role.ADMIN ? payload.payrollEnabled : false });
  }

  @Patch(':employeeId')
  async updateEmployee(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: UpdateEmployeeDto,
    @Req() request: { user: { sub: string } },
  ) {
    await this.employeesService.assertEmployeeManagement(request.user.sub, payload, employeeId);
    return this.employeesService.updateEmployee(employeeId, payload);
  }

  @Delete(':employeeId')
  deleteEmployee(@Param('employeeId', new ParseUUIDPipe()) employeeId: string) {
    return this.employeesService.deleteEmployee(employeeId);
  }
}
