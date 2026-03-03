import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  private toDateOrNull(value?: string | null) {
    if (!value) return null;
    const normalized = value.length === 10 ? `${value}T00:00:00.000Z` : value;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid dueDate');
    }
    return parsed;
  }

  async createTask(payload: CreateTaskDto, createdByUserId: string) {
    return this.prisma.task.create({
      data: {
        title: payload.title,
        description: payload.description ?? null,
        bulkItemName: payload.bulkItemName ?? null,
        status: payload.status ?? TaskStatus.OPEN,
        priority: payload.priority ?? TaskPriority.MEDIUM,
        dueDate: this.toDateOrNull(payload.dueDate),
        createdByUserId,
        assignedToUserId: payload.assignedToUserId ?? null,
      },
    });
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
            employee: { select: { name: true } },
          },
        },
      },
    });

    return tasks.map((task) => ({
      ...task,
      assignedTo: task.assignedTo
        ? {
            id: task.assignedTo.id,
            name: task.assignedTo.employee?.name ?? task.assignedTo.email,
          }
        : null,
    }));
  }

  async updateTask(id: string, payload: UpdateTaskDto) {
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
    };

    if (payload.dueDate !== undefined) {
      data.dueDate = this.toDateOrNull(payload.dueDate);
    }

    return this.prisma.task.update({
      where: { id },
      data,
    });
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
            assetFamilyId: true,
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

  private async assertTaskExists(taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
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
