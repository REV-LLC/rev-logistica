import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, EmployeeActivityType } from '@prisma/client';
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

const activityAssetSelect = {
  id: true,
  publicCode: true,
  description: true,
  serialOrEngine: true,
  internalNumber: true,
  imageFileObject: { select: { storageKey: true } },
  sku: {
    select: {
      name: true,
      imageUrl: true,
      imageFileObject: { select: { storageKey: true } },
    },
  },
} as const;

const noteInclude = {
  sourceAttendance: {
    select: {
      enteredAt: true,
      leftAt: true,
      checkOutReportId: true,
      checkInReport: { select: { deletedAt: true } },
      checkOutReport: { select: { deletedAt: true } },
    },
  },
  warehouse: { select: { id: true, name: true } },
  customerWorksite: { include: { customer: true, worksite: true } },
  asset: { select: activityAssetSelect },
  createdBy: {
    select: { employee: { select: { name: true, lastName: true } } },
  },
} as const;

@Injectable()
export class EmployeeActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async options() {
    const [customers, assets, warehouses] = await Promise.all([
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
        select: activityAssetSelect,
      }),
      this.prisma.warehouse.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ]);
    return { customers, assets, warehouses };
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
      where: {
        employeeId,
        date: { lt: end },
        OR: [{ date: { gte: start } }, { endDate: { gte: start } }],
      },
      include: noteInclude,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async data(
    payload: ActivityNoteDto,
    previous?: {
      customerWorksiteId: string | null;
      assetId: string | null;
      warehouseId?: string | null;
    },
    attendanceSuggestion = false,
  ) {
    const date = parseCalendarDate(payload.date);
    const type = payload.type ?? EmployeeActivityType.WORKSITE;
    if (!Object.values(EmployeeActivityType).includes(type))
      throw new BadRequestException('El tipo de registro no es válido.');
    const description = payload.description.trim();
    if (!description) throw new BadRequestException('Escribe una descripción.');
    if (type === EmployeeActivityType.WAREHOUSE) {
      if (!payload.warehouseId)
        throw new BadRequestException('Selecciona una bodega.');
      const [warehouse, asset] = await Promise.all([
        this.prisma.warehouse.findUnique({
          where: { id: payload.warehouseId },
          select: { active: true },
        }),
        payload.assetId
          ? this.prisma.asset.findUnique({
              where: { id: payload.assetId },
              select: { active: true, deletedAt: true },
            })
          : null,
      ]);
      if (
        !warehouse ||
        (previous?.warehouseId !== payload.warehouseId && !warehouse.active)
      )
        throw new BadRequestException('Selecciona una bodega disponible.');
      if (
        payload.assetId &&
        (!asset ||
          (previous?.assetId !== payload.assetId &&
            (!asset.active || asset.deletedAt)))
      )
        throw new BadRequestException('Selecciona un activo disponible.');
      return {
        date,
        endDate: null,
        type,
        description,
        warehouseId: payload.warehouseId,
        customerWorksiteId: null,
        assetId: payload.assetId ?? null,
      };
    }
    if (type !== EmployeeActivityType.WORKSITE) {
      const endDate = parseCalendarDate(payload.endDate ?? '');
      if (endDate < date)
        throw new BadRequestException(
          'La fecha de fin debe ser igual o posterior al inicio.',
        );
      return {
        date,
        endDate,
        type,
        description,
        customerWorksiteId: null,
        warehouseId: null,
        assetId: null,
      };
    }
    if (
      !payload.customerWorksiteId ||
      (!payload.assetId && !attendanceSuggestion)
    )
      throw new BadRequestException('Selecciona una obra y un equipo.');
    const [worksite, asset] = await Promise.all([
      this.prisma.customerWorksite.findUnique({
        where: { id: payload.customerWorksiteId },
        include: { worksite: true },
      }),
      payload.assetId
        ? this.prisma.asset.findUnique({
            where: { id: payload.assetId },
            select: { active: true, deletedAt: true },
          })
        : null,
    ]);
    if (
      !worksite ||
      (previous?.customerWorksiteId !== payload.customerWorksiteId &&
        (!worksite.active || !worksite.worksite.active))
    ) {
      throw new BadRequestException('Selecciona una obra disponible.');
    }
    if (
      payload.assetId &&
      (!asset ||
        (previous?.assetId !== payload.assetId &&
          (!asset.active || asset.deletedAt)))
    ) {
      throw new BadRequestException('Selecciona un activo disponible.');
    }
    return {
      date,
      endDate: null,
      type,
      warehouseId: null,
      customerWorksiteId: payload.customerWorksiteId,
      assetId: payload.assetId ?? null,
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

  async update(
    employeeId: string,
    id: string,
    payload: ActivityNoteDto,
    userId?: string,
  ) {
    const previous = await this.note(employeeId, id);
    const data = await this.data(
      payload,
      previous,
      Boolean(previous.sourceAttendanceId),
    );
    if (previous.sourceAttendanceId) {
      if (!userId)
        throw new ForbiddenException(
          'Falta el usuario que revisa la sugerencia.',
        );
      return this.reviewTransaction(employeeId, id, 'CORRECT', userId, {
        ...data,
        ...(payload.verifiedEnteredAt
          ? { verifiedEnteredAt: new Date(payload.verifiedEnteredAt) }
          : {}),
        ...(payload.verifiedLeftAt !== undefined
          ? {
              verifiedLeftAt: payload.verifiedLeftAt
                ? new Date(payload.verifiedLeftAt)
                : null,
            }
          : {}),
      });
    }
    return this.prisma.employeeActivityNote.update({
      where: { id },
      data,
      include: noteInclude,
    });
  }

  async review(
    employeeId: string,
    id: string,
    action: 'CONFIRM' | 'DISMISS',
    userId: string,
  ) {
    if (!['CONFIRM', 'DISMISS'].includes(action))
      throw new BadRequestException('Acción inválida.');
    return this.reviewTransaction(employeeId, id, action, userId);
  }
  private async reviewTransaction(
    employeeId: string,
    id: string,
    action: string,
    userId: string,
    changes?: Prisma.EmployeeActivityNoteUncheckedUpdateInput,
  ) {
    return this.prisma.$transaction((tx) =>
      this.reviewInTransaction(tx, employeeId, id, action, userId, changes),
    );
  }
  async reviewBatch(employeeId: string, ids: string[], userId: string) {
    if (!ids.length || ids.length > 100)
      throw new BadRequestException('Selecciona entre 1 y 100 sugerencias.');
    const unique = [...new Set(ids)].sort();
    return this.prisma.$transaction(
      async (tx) => {
        for (const id of unique)
          await this.reviewInTransaction(tx, employeeId, id, 'CONFIRM', userId);
        return { confirmed: unique.length };
      },
      { timeout: 20000 },
    );
  }
  private async reviewInTransaction(
    tx: Prisma.TransactionClient,
    employeeId: string,
    id: string,
    action: string,
    userId: string,
    changes?: Prisma.EmployeeActivityNoteUncheckedUpdateInput,
  ) {
    const actor = await tx.user.findFirst({
      where: {
        id: userId,
        active: true,
        role: { in: [Role.ADMIN, Role.OFFICE] },
      },
      select: { id: true },
    });
    if (!actor)
      throw new ForbiddenException(
        'Solo ADMIN y OFFICE pueden revisar sugerencias.',
      );
    await tx.$queryRaw`SELECT id FROM "EmployeeActivityNote" WHERE id = ${id} FOR UPDATE`;
    const current = await tx.employeeActivityNote.findFirst({
      where: { id, employeeId },
      include: {
        sourceAttendance: {
          include: { checkInReport: true, checkOutReport: true },
        },
      },
    });
    if (!current?.sourceAttendance)
      throw new NotFoundException(
        'No se encontró la sugerencia de este empleado.',
      );
    const source = current.sourceAttendance;
    if (action === 'CONFIRM' && current.reviewStatus === 'DISMISSED')
      throw new BadRequestException(
        'Esta sugerencia fue descartada. Corrígela si necesitas recuperarla.',
      );
    if (
      action === 'CONFIRM' &&
      (!source.leftAt ||
        current.sourceInvalidatedAt ||
        source.checkInReport.deletedAt ||
        source.checkOutReport?.deletedAt)
    )
      throw new BadRequestException(
        'La jornada está abierta o tiene un reporte eliminado. Revisa la evidencia antes de confirmar.',
      );
    const entered =
      changes?.verifiedEnteredAt instanceof Date
        ? changes.verifiedEnteredAt
        : (current.verifiedEnteredAt ?? source.enteredAt);
    const left =
      changes && 'verifiedLeftAt' in changes
        ? (changes.verifiedLeftAt as Date | null)
        : (current.verifiedLeftAt ?? source.leftAt);
    if (
      action !== 'DISMISS' &&
      (!Number.isFinite(entered.getTime()) ||
        (left && (!Number.isFinite(left.getTime()) || left <= entered)))
    )
      throw new BadRequestException(
        'La salida revisada debe ser posterior a la entrada.',
      );
    if (action !== 'DISMISS' && source.leftAt && !left)
      throw new BadRequestException(
        'Completa la salida revisada de la jornada cerrada.',
      );
    if (action === 'CONFIRM' && !left)
      throw new BadRequestException(
        'Falta la salida revisada de esta jornada.',
      );
    const status =
      action === 'DISMISS'
        ? 'DISMISSED'
        : action === 'CORRECT'
          ? 'CORRECTED'
          : current.reviewStatus === 'CORRECTED'
            ? 'CORRECTED'
            : 'CONFIRMED';
    const result = await tx.employeeActivityNote.update({
      where: { id },
      data: {
        ...changes,
        ...(action !== 'DISMISS'
          ? { verifiedEnteredAt: entered, verifiedLeftAt: left }
          : {}),
        reviewStatus: status,
        reviewedAt: new Date(),
        reviewedByUserId: actor.id,
        reviewedSourceExitId: source.checkOutReportId,
      },
      include: noteInclude,
    });
    const snapshot = (note: {
      description: string;
      date: Date;
      customerWorksiteId: string | null;
      assetId: string | null;
      reviewStatus: string | null;
      type: string;
      endDate: Date | null;
      warehouseId: string | null;
      verifiedEnteredAt: Date | null;
      verifiedLeftAt: Date | null;
    }) => ({
      description: note.description,
      date: note.date.toISOString(),
      customerWorksiteId: note.customerWorksiteId,
      assetId: note.assetId,
      reviewStatus: note.reviewStatus,
      type: note.type,
      endDate: note.endDate?.toISOString() ?? null,
      warehouseId: note.warehouseId,
      verifiedEnteredAt: note.verifiedEnteredAt?.toISOString() ?? null,
      verifiedLeftAt: note.verifiedLeftAt?.toISOString() ?? null,
    });
    await tx.employeeActivityReview.create({
      data: {
        noteId: id,
        action,
        userId: actor.id,
        previousData: snapshot(current),
        nextData: {
          ...snapshot(result),
          sourceEnteredAt: source.enteredAt.toISOString(),
          sourceLeftAt: source.leftAt?.toISOString() ?? null,
          checkInReportId: source.checkInReportId,
          checkOutReportId: source.checkOutReportId,
        },
      },
    });
    return result;
  }
  async remove(employeeId: string, id: string, userId?: string) {
    const note = await this.note(employeeId, id);
    if (note.sourceAttendanceId) {
      if (!userId)
        throw new ForbiddenException(
          'Falta el usuario que revisa la sugerencia.',
        );
      await this.review(employeeId, id, 'DISMISS', userId);
      return { deleted: true };
    }
    await this.prisma.employeeActivityNote.delete({ where: { id } });
    return { deleted: true };
  }
}
