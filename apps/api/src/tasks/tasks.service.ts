import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TaskPriority,
  TaskReminderUnit,
  TaskStatus,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private toDateOrNull(value?: string | null) {
    if (!value) return null;
    const normalized = value.length === 10 ? `${value}T00:00:00.000Z` : value;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid dueDate');
    }
    return parsed;
  }

  private assertSingleAssignee(payload: { assignedToUserId?: string | null; assignedToEmployeeId?: string | null }) {
    if (payload.assignedToUserId && payload.assignedToEmployeeId) {
      throw new BadRequestException('Task can only be assigned to one responsible');
    }
  }

  private assertValidReminderInterval(payload: {
    reminderIntervalValue?: number | null;
    reminderIntervalUnit?: TaskReminderUnit | null;
  }) {
    const hasValue = payload.reminderIntervalValue != null;
    const hasUnit = payload.reminderIntervalUnit != null;
    if (hasValue !== hasUnit) {
      throw new BadRequestException(
        'Reminder interval value and unit must be provided together',
      );
    }
  }

  async createTask(payload: CreateTaskDto, createdByUserId: string) {
    this.assertSingleAssignee(payload);
    this.assertValidReminderInterval(payload);

    const task = await this.prisma.task.create({
      data: {
        title: payload.title,
        description: payload.description ?? null,
        bulkItemName: payload.bulkItemName ?? null,
        status: payload.status ?? TaskStatus.OPEN,
        priority: payload.priority ?? TaskPriority.MEDIUM,
        dueDate: this.toDateOrNull(payload.dueDate),
        reminderIntervalValue: payload.reminderIntervalValue ?? null,
        reminderIntervalUnit: payload.reminderIntervalUnit ?? null,
        createdByUserId,
        assignedToUserId: payload.assignedToUserId ?? null,
        assignedToEmployeeId: payload.assignedToEmployeeId ?? null,
      },
    });
    await this.notifications.syncTaskNotification(task.id, 'CREATED');
    return task;
  }

  async listTasks(params: {
    status?: TaskStatus;
    assignedToUserId?: string;
    q?: string;
    take?: number;
    skip?: number;
  }) {
    const where: Prisma.TaskWhereInput = {};

    if (params.status) {
      where.status = params.status;
    } else {
      where.status = { notIn: [TaskStatus.DONE, TaskStatus.DELETED] };
    }

    if (params.assignedToUserId) {
      where.OR = [
        { assignedToUserId: params.assignedToUserId },
        { assignedToEmployee: { userId: params.assignedToUserId } },
      ];
    }

    if (params.q) {
      where.OR = [
        { title: { contains: params.q, mode: 'insensitive' } },
        { description: { contains: params.q, mode: 'insensitive' } },
      ];
    }

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.take,
      skip: params.skip,
      include: {
        assignedTo: {
          select: {
            id: true,
            email: true,
            employee: { select: { name: true, lastName: true } },
          },
        },
        assignedToEmployee: {
          select: {
            id: true,
            name: true,
            lastName: true,
            active: true,
          },
        },
      },
    });

    return tasks.map((task) => {
      const { assignedTo, assignedToEmployee, ...rest } = task;

      return {
        ...rest,
        assignedToUser: assignedTo
          ? {
              id: assignedTo.id,
              name: assignedTo.employee
                ? `${assignedTo.employee.name} ${assignedTo.employee.lastName}`.trim()
                : assignedTo.email,
            }
          : null,
        assignedToEmployee: assignedToEmployee
          ? {
              id: assignedToEmployee.id,
              name: `${assignedToEmployee.name} ${assignedToEmployee.lastName}`.trim(),
              active: assignedToEmployee.active,
            }
          : null,
      };
    });
  }

  async updateTask(id: string, payload: UpdateTaskDto) {
    this.assertSingleAssignee(payload);
    this.assertValidReminderInterval(payload);

    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const data: Prisma.TaskUpdateInput = {
      title: payload.title,
      description: payload.description,
      bulkItemName: payload.bulkItemName,
      status: payload.status,
      priority: payload.priority,
      reminderIntervalValue: payload.reminderIntervalValue,
      reminderIntervalUnit: payload.reminderIntervalUnit,
      assignedTo: payload.assignedToUserId
        ? { connect: { id: payload.assignedToUserId } }
        : payload.assignedToUserId === null
          ? { disconnect: true }
          : undefined,
      assignedToEmployee: payload.assignedToEmployeeId
        ? { connect: { id: payload.assignedToEmployeeId } }
        : payload.assignedToEmployeeId === null
          ? { disconnect: true }
          : undefined,
    };

    if (payload.assignedToUserId) {
      data.assignedToEmployee = { disconnect: true };
    }

    if (payload.assignedToEmployeeId) {
      data.assignedTo = { disconnect: true };
    }

    if (payload.dueDate !== undefined) {
      data.dueDate = this.toDateOrNull(payload.dueDate);
    }

    const assignmentChanged =
      (payload.assignedToUserId !== undefined && payload.assignedToUserId !== existing.assignedToUserId) ||
      (payload.assignedToEmployeeId !== undefined && payload.assignedToEmployeeId !== existing.assignedToEmployeeId);
    const task = await this.prisma.task.update({
      where: { id },
      data,
    });
    const dueDateChanged = payload.dueDate !== undefined
      && task.dueDate?.toISOString() !== existing.dueDate?.toISOString();
    await this.notifications.syncTaskNotification(
      task.id,
      assignmentChanged ? 'REASSIGNED' : dueDateChanged ? 'DUE_DATE_CHANGED' : 'UPDATED',
    );
    return task;
  }

  async deleteTask(taskId: string) {
    await this.assertTaskExists(taskId);
    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.DELETED },
    });
    await this.notifications.syncTaskNotification(taskId, 'UPDATED');
    return { deleted: true };
  }

  private async assertTaskExists(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
  }
}
