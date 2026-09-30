import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityNoteDto } from './employee-activities.dto';

export function parseCalendarDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException('La fecha no es válida.');
  }
  return date;
}

const noteInclude = {
  customerWorksite: { include: { customer: true, worksite: true } },
  asset: {
    select: {
      id: true,
      publicCode: true,
      description: true,
      serialOrEngine: true,
      sku: { select: { name: true } },
    },
  },
  createdBy: {
    select: { employee: { select: { name: true, lastName: true } } },
  },
} as const;

@Injectable()
export class EmployeeActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async options() {
    const [customers, assets] = await Promise.all([
      this.prisma.customer.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          nitOrId: true,
          customerWorksites: {
            where: { active: true, worksite: { active: true } },
            select: {
              id: true,
              alias: true,
              worksite: { select: { id: true, name: true, address: true } },
            },
            orderBy: { worksite: { name: 'asc' } },
          },
        },
      }),
      this.prisma.asset.findMany({
        where: { active: true, deletedAt: null },
        orderBy: { publicCode: 'asc' },
        select: {
          id: true,
          publicCode: true,
          description: true,
          serialOrEngine: true,
          sku: { select: { name: true } },
        },
      }),
    ]);
    return { customers, assets };
  }

  private async employee(employeeId: string) {
    if (
      !(await this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true },
      }))
    ) {
      throw new NotFoundException('El empleado no existe.');
    }
  }

  async list(employeeId: string, month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new BadRequestException('El mes no es válido.');
    await this.employee(employeeId);
    const start = parseCalendarDate(`${month}-01`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return this.prisma.employeeActivityNote.findMany({
      where: { employeeId, date: { gte: start, lt: end } },
      include: noteInclude,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async data(
    payload: ActivityNoteDto,
    previous?: { customerWorksiteId: string; assetId: string },
  ) {
    const date = parseCalendarDate(payload.date);
    const [worksite, asset] = await Promise.all([
      this.prisma.customerWorksite.findUnique({
        where: { id: payload.customerWorksiteId },
        include: { worksite: true },
      }),
      this.prisma.asset.findUnique({
        where: { id: payload.assetId },
        select: { active: true, deletedAt: true },
      }),
    ]);
    if (
      !worksite ||
      (previous?.customerWorksiteId !== payload.customerWorksiteId &&
        (!worksite.active || !worksite.worksite.active))
    ) {
      throw new BadRequestException('Selecciona una obra disponible.');
    }
    if (
      !asset ||
      (previous?.assetId !== payload.assetId &&
        (!asset.active || asset.deletedAt))
    ) {
      throw new BadRequestException('Selecciona un activo disponible.');
    }
    const description = payload.description.trim();
    if (!description) throw new BadRequestException('Escribe una descripción.');
    return {
      date,
      customerWorksiteId: payload.customerWorksiteId,
      assetId: payload.assetId,
      description,
    };
  }

  async create(employeeId: string, payload: ActivityNoteDto, userId: string) {
    await this.employee(employeeId);
    const data = await this.data(payload);
    return this.prisma.employeeActivityNote.create({
      data: { ...data, employeeId, createdByUserId: userId },
      include: noteInclude,
    });
  }

  private async note(employeeId: string, id: string) {
    const note = await this.prisma.employeeActivityNote.findFirst({
      where: { id, employeeId },
    });
    if (!note)
      throw new NotFoundException('La nota no existe para este empleado.');
    return note;
  }

  async update(employeeId: string, id: string, payload: ActivityNoteDto) {
    const previous = await this.note(employeeId, id);
    const data = await this.data(payload, previous);
    return this.prisma.employeeActivityNote.update({
      where: { id },
      data,
      include: noteInclude,
    });
  }

  async remove(employeeId: string, id: string) {
    await this.note(employeeId, id);
    await this.prisma.employeeActivityNote.delete({ where: { id } });
    return { deleted: true };
  }
}
