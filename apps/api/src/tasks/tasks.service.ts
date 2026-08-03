import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { NotificationTransportService } from '../notifications/notification-transport.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationTransport: NotificationTransportService,
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

  async createTask(payload: CreateTaskDto, createdByUserId: string) {
    this.assertSingleAssignee(payload);

    const task = await this.prisma.task.create({
      data: {
        title: payload.title,
        description: payload.description ?? null,
        bulkItemName: payload.bulkItemName ?? null,
        status: payload.status ?? TaskStatus.OPEN,
        priority: payload.priority ?? TaskPriority.MEDIUM,
        dueDate: this.toDateOrNull(payload.dueDate),
        createdByUserId,
        assignedToUserId: payload.assignedToUserId ?? null,
        assignedToEmployeeId: payload.assignedToEmployeeId ?? null,
      },
    });

    if (task.assignedToUserId || task.assignedToEmployeeId) {
      await this.notifyTaskAssignment(task);
    }

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
    }

    if (params.assignedToUserId) {
      where.assignedToUserId = params.assignedToUserId;
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

    if (assignmentChanged && (task.assignedToUserId || task.assignedToEmployeeId)) {
      await this.notifyTaskAssignment(task);
    }

    return task;
  }

  private async notifyTaskAssignment(task: {
    id: string;
    title: string;
    assignedToUserId: string | null;
    assignedToEmployeeId: string | null;
  }) {
    try {
      const assignee = task.assignedToUserId
        ? await this.prisma.user.findUnique({
            where: { id: task.assignedToUserId },
            select: {
              active: true,
              email: true,
              employee: { select: { name: true, lastName: true, phone: true } },
            },
          })
        : null;
      const employee =
        !assignee && task.assignedToEmployeeId
          ? await this.prisma.employee.findUnique({
              where: { id: task.assignedToEmployeeId },
              select: { active: true, name: true, lastName: true, phone: true },
            })
          : null;
      const active = assignee?.active ?? employee?.active ?? false;
      const name = assignee?.employee
        ? `${assignee.employee.name} ${assignee.employee.lastName}`.trim()
        : employee
          ? `${employee.name} ${employee.lastName}`.trim()
          : assignee?.email;
      const phone = assignee?.employee?.phone ?? employee?.phone;

      if (!active || !phone || !name) return;

      const publicWebUrl = process.env.PUBLIC_WEB_URL?.trim().replace(/\/+$/, '');
      const response = await this.notificationTransport.sendWhatsapp(phone, {
        title: 'Nueva tarea asignada',
        body: `Se te ha asignado la tarea “${task.title}”. Por favor, revisa la app.`,
        recipientName: name,
        link: publicWebUrl ? `${publicWebUrl}/tasks` : '/tasks',
      });

      if (!response.sent) {
        this.logger.warn(`Task assignment WhatsApp not sent for task ${task.id}: ${response.reason}`);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Task assignment WhatsApp failed for task ${task.id}: ${detail}`);
    }
  }

  async listTaskAssets(taskId: string) {
    await this.assertTaskExists(taskId);
    return this.prisma.taskAsset.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        asset: {
          select: {
            id: true,
            serialOrEngine: true,
            description: true,
            skuId: true,
            internalNumber: true,
          },
        },
      },
    });
  }

  async addTaskAsset(taskId: string, assetId: string) {
    await this.assertTaskExists(taskId);
    await this.assertAssetExists(assetId);

    return this.prisma.taskAsset.create({
      data: { taskId, assetId },
    });
  }

  async removeTaskAsset(taskId: string, assetId: string) {
    await this.assertTaskExists(taskId);
    await this.assertAssetExists(assetId);

    await this.prisma.taskAsset.deleteMany({
      where: { taskId, assetId },
    });

    return { deleted: true };
  }

  async deleteTask(taskId: string) {
    await this.assertTaskExists(taskId);

    return this.prisma.$transaction(async (tx) => {
      await tx.taskAsset.deleteMany({ where: { taskId } });
      await tx.task.delete({ where: { id: taskId } });
      return { deleted: true };
    });
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

  private async assertAssetExists(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true },
    });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }
  }
}
