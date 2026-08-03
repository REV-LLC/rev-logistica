import {
  BadRequestException,
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
import { Role, TaskStatus } from '@prisma/client';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  createTask(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateTaskDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.tasksService.createTask(payload, request.user.sub);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  listTasks(
    @Query('status') status?: TaskStatus,
    @Query('assignedToMe') assignedToMe?: string,
    @Query('q') q?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Req() request?: Request & { user: JwtPayload },
  ) {
    const parsedTake = take ? Number(take) : undefined;
    const parsedSkip = skip ? Number(skip) : undefined;

    if (take && Number.isNaN(parsedTake)) {
      throw new BadRequestException('Invalid take');
    }

    if (skip && Number.isNaN(parsedSkip)) {
      throw new BadRequestException('Invalid skip');
    }

    if (status && !Object.values(TaskStatus).includes(status)) {
      throw new BadRequestException('Invalid status');
    }

    const assignedToUserId = assignedToMe === 'true' ? request?.user.sub : undefined;

    return this.tasksService.listTasks({
      status,
      assignedToUserId,
      q,
      take: parsedTake,
      skip: parsedSkip,
    });
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  updateTask(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: UpdateTaskDto,
  ) {
    return this.tasksService.updateTask(id, payload);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  deleteTask(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.tasksService.deleteTask(id);
  }

  @Get(':id/assets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  listTaskAssets(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.tasksService.listTaskAssets(id);
  }

  @Post(':id/assets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  addTaskAsset(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: { assetId: string },
  ) {
    if (!payload?.assetId) {
      throw new BadRequestException('assetId is required');
    }
    return this.tasksService.addTaskAsset(id, payload.assetId);
  }

  @Delete(':id/assets/:assetId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OFFICE)
  removeTaskAsset(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ) {
    return this.tasksService.removeTaskAsset(id, assetId);
  }
}
