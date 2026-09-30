import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChargeType, Prisma, Role, WarehouseType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CompleteMaintenanceDto,
  CreateMaintenanceItemDto,
  CreateMaintenancePlanDto,
  RecordAssetHoursDto,
  RecordMaintenanceDto,
  UpdateMaintenanceItemDto,
} from './dto/maintenance.dto';

type MaintenanceScheduleType = 'HOURS' | 'CALENDAR_DAYS';

const HOUR_METER_EVIDENCE_CATEGORIES = [
  'EVIDENCIA_HOROMETRO',
  'MANTENIMIENTO',
] as const;

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async listOwnWarehouseAssets() {
    const assets = await this.prisma.asset.findMany({
      where: {
        active: true,
        warehouseOwner: { type: WarehouseType.OWN },
        sku: { chargeType: ChargeType.HOUR },
      },
      orderBy: [{ warehouseOwner: { name: 'asc' } }, { publicCode: 'asc' }],
      select: {
        id: true,
        internalNumber: true,
        publicCode: true,
        serialOrEngine: true,
        description: true,
        brand: true,
        model: true,
        hourMeter: true,
        imageFileObject: { select: { storageKey: true } },
        warehouseOwner: { select: { id: true, name: true, type: true } },
        warehouseCurrent: { select: { id: true, name: true } },
        sku: { select: { name: true, imageUrl: true } },
      },
    });

    return assets.map((asset) => ({
      ...asset,
      currentHourMeter: Number(asset.hourMeter),
      imageUrl: asset.imageFileObject?.storageKey ?? asset.sku.imageUrl ?? null,
    }));
  }

  async listSubjects() {
    const [assets, vehicles] = await Promise.all([
      this.prisma.asset.findMany({
        where: { active: true, warehouseOwner: { type: WarehouseType.OWN } },
        orderBy: { publicCode: 'asc' },
        select: { id: true, publicCode: true, internalNumber: true, description: true, brand: true, model: true, sku: { select: { name: true } } },
      }),
      this.prisma.vehicle.findMany({ where: { active: true }, orderBy: { plate: 'asc' }, select: { id: true, plate: true, brand: true, model: true } }),
    ]);
    return [
      ...assets.map((asset) => ({ type: 'ASSET' as const, id: asset.id, label: [asset.description || asset.sku.name, asset.brand, asset.model, asset.publicCode || `#${asset.internalNumber}`].filter(Boolean).join(' · ') })),
      ...vehicles.map((vehicle) => ({ type: 'VEHICLE' as const, id: vehicle.id, label: [vehicle.plate, vehicle.brand, vehicle.model].filter(Boolean).join(' · ') })),
    ];
  }

  async createPlan(payload: CreateMaintenancePlanDto) {
    this.assertSingleSubject(payload.assetId, payload.vehicleId);
    const scheduleType = await this.subjectScheduleType(payload.assetId, payload.vehicleId);

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.maintenancePlan.create({
        data: {
          assetId: payload.assetId ?? null,
          vehicleId: payload.vehicleId ?? null,
          name: payload.name.trim(),
          active: payload.active ?? true,
          items: {
            create: payload.items.map((item) => ({
              name: item.name.trim(),
              instructions: item.instructions?.trim() || null,
              ...this.createScheduleData(item, scheduleType),
              active: item.active ?? true,
            })),
          },
        },
        include: { items: true },
      });
      for (let index = 0; index < plan.items.length; index += 1) {
        await this.notifications.ensureMaintenanceTopic(plan.items[index].id, payload.items[index].recipients, tx);
      }
      return this.planWithTopics(plan.id, tx);
    });
  }

  async recordMaintenance(payload: RecordMaintenanceDto, userId: string) {
    const performedByUserId = await this.resolvePerformer(payload.performedByUserId, userId);
    this.assertSingleSubject(payload.assetId, payload.vehicleId);
    const scheduleType = await this.subjectScheduleType(payload.assetId, payload.vehicleId);
    const completedAt = payload.completedAt ? new Date(payload.completedAt) : new Date();
    if (completedAt > new Date()) throw new BadRequestException('La fecha del mantenimiento no puede estar en el futuro');
    if (scheduleType === 'HOURS' && payload.completedAtHours == null) {
      throw new BadRequestException('Ingresa el horómetro al realizar el mantenimiento');
    }
    const itemIds = payload.tasks.flatMap((task) => task.itemId ? [task.itemId] : []);
    if (new Set(itemIds).size !== itemIds.length) throw new BadRequestException('No repitas una revisión en el mismo registro');

    return this.prisma.$transaction(async (tx) => {
      const subjectWhere = payload.assetId ? { assetId: payload.assetId } : { vehicleId: payload.vehicleId! };
      const completions: Array<{ id: string }> = [];
      const reusableWhere = { plan: { ...subjectWhere, active: true }, OR: [{ active: true }, { intervalHours: null, intervalDays: null }] };
      const normalizeName = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
      const usedItems = new Set<string>();
      let recordPlanId: string | undefined;
      for (const task of payload.tasks) {
        let itemId = task.itemId;
        const reference = task.reference?.trim() || null;
        if (!itemId && task.name?.trim()) {
          const candidates = await tx.maintenanceItem.findMany({ where: reusableWhere });
          const matches = candidates.filter((item) => normalizeName(item.name) === normalizeName(task.name!));
          if (matches.length > 1) throw new BadRequestException('Hay varias revisiones con ese nombre. Selecciona la revisión existente que corresponde');
          itemId = matches[0]?.id;
        }
        if (itemId && usedItems.has(itemId)) throw new BadRequestException('No repitas una revisión en el mismo registro');
        if (itemId) {
          if (task.recurrence) throw new BadRequestException('Edita el intervalo de la revisión desde su plan');
          const item = await tx.maintenanceItem.findFirst({
            where: { id: itemId, ...reusableWhere },
          });
          if (!item) throw new BadRequestException('La revisión no pertenece a un plan activo de este equipo');
          this.validateRecordReference(item.name, reference);
          const latest = await tx.maintenanceCompletion.findFirst({ where: { itemId }, orderBy: { completedAt: 'desc' } });
          if (latest && completedAt <= latest.completedAt) {
            throw new BadRequestException('La fecha debe ser posterior al último mantenimiento de esta revisión');
          }
          if (latest?.completedAtHours != null && payload.completedAtHours! < Number(latest.completedAtHours)) {
            throw new BadRequestException('Las horas no pueden ser inferiores al mantenimiento anterior');
          }
        } else {
          if (!task.name?.trim()) throw new BadRequestException('Escribe el trabajo realizado');
          this.validateRecordReference(task.name, reference);
          if (!recordPlanId) {
            const plan = await tx.maintenancePlan.findFirst({ where: { ...subjectWhere, name: 'Mantenimientos registrados', active: true } });
            recordPlanId = plan?.id ?? (await tx.maintenancePlan.create({ data: { ...subjectWhere, name: 'Mantenimientos registrados' } })).id;
          }
          const schedule = task.recurrence ? this.createScheduleData({
            ...task.recurrence,
            baselineHours: payload.completedAtHours,
            baselineDate: completedAt.toISOString(),
          }, scheduleType) : {};
          const item = await tx.maintenanceItem.create({ data: {
            planId: recordPlanId, name: task.name.trim(),
            instructions: task.recurrence?.instructions?.trim() || null,
            ...schedule, active: Boolean(task.recurrence),
          } });
          itemId = item.id;
          if (task.recurrence) await this.notifications.ensureMaintenanceTopic(item.id, task.recurrence.recipients, tx);
        }
        usedItems.add(itemId!);
        completions.push(await tx.maintenanceCompletion.create({ data: {
          itemId,
          completedAt,
          reference,
          completedAtHours: scheduleType === 'HOURS' ? payload.completedAtHours : null,
          notes: payload.notes?.trim() || null,
          performedByUserId,
          completedByUserId: userId,
        } }));
      }
      // An administrative service record is also a meter observation. Never roll it back.
      if (scheduleType === 'HOURS') {
        const hours = payload.completedAtHours!;
        const note = 'Lectura registrada al realizar mantenimiento';
        if (payload.assetId) {
          const asset = await tx.asset.findUniqueOrThrow({ where: { id: payload.assetId }, select: { hourMeter: true } });
          if (hours > Number(asset.hourMeter)) {
            await tx.asset.update({ where: { id: payload.assetId }, data: { hourMeter: hours } });
            await tx.assetHourReading.create({ data: {
              assetId: payload.assetId, hours, previousHours: asset.hourMeter, recordedAt: completedAt, note, recordedByUserId: userId,
            } });
          }
        } else {
          const latest = await tx.vehicleHourReading.findFirst({ where: { vehicleId: payload.vehicleId! }, orderBy: { hours: 'desc' } });
          if (hours > Number(latest?.hours ?? 0)) await tx.vehicleHourReading.create({ data: {
            vehicleId: payload.vehicleId!, hours, recordedAt: completedAt, note, recordedByUserId: userId,
          } });
        }
      }
      return { completions };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async resolvePerformer(selectedUserId: string | undefined, sessionUserId: string) {
    const id = selectedUserId ?? sessionUserId;
    const user = await this.prisma.user.findFirst({ where: { id, active: true }, select: { id: true } });
    if (!user) throw new BadRequestException('Selecciona un usuario activo en Realizado por');
    return user.id;
  }

  private validateRecordReference(name: string, reference: string | null) {
    if (!reference) return;
    const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    if (normalized === 'cambio de aceite de motor' && !/^\d+W-\d+$/.test(reference ?? '')) {
      throw new BadRequestException('Ingresa la viscosidad del aceite de motor en formato 15W-40');
    }
    if (normalized === 'cambio de aceite hidraulico' && !['AW68', 'ISO68'].includes(reference ?? '')) {
      throw new BadRequestException('Selecciona AW68 o ISO68 para el aceite hidráulico');
    }

  }

  async addItem(planId: string, payload: CreateMaintenanceItemDto) {
    const scheduleType = await this.planScheduleType(planId);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.maintenanceItem.create({
        data: {
          planId,
          name: payload.name.trim(),
          instructions: payload.instructions?.trim() || null,
          ...this.createScheduleData(payload, scheduleType),
          active: payload.active ?? true,
        },
      });
      const notificationTopic = await this.notifications.ensureMaintenanceTopic(item.id, payload.recipients, tx);
      return { ...item, notificationTopic };
    });
  }

  async updateItem(itemId: string, payload: UpdateMaintenanceItemDto) {
    const scheduleType = await this.itemScheduleType(itemId);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.maintenanceItem.update({
        where: { id: itemId },
        data: {
          name: payload.name?.trim(),
          instructions: payload.instructions === undefined ? undefined : payload.instructions.trim() || null,
          ...this.updateScheduleData(payload, scheduleType),
          active: payload.active,
        },
      });
      const notificationTopic = payload.recipients
        ? await this.notifications.ensureMaintenanceTopic(itemId, payload.recipients, tx)
        : null;
      return { ...item, ...(notificationTopic ? { notificationTopic } : {}) };
    });
  }

  async updatePlan(planId: string, payload: { name?: string; active?: boolean }) {
    await this.assertPlan(planId);
    if (payload.name !== undefined && !payload.name.trim()) throw new BadRequestException('name cannot be empty');
    return this.prisma.maintenancePlan.update({
      where: { id: planId }, data: { name: payload.name?.trim(), active: payload.active },
    });
  }

  async deletePlan(planId: string) {
    await this.assertPlan(planId);
    await this.prisma.maintenancePlan.update({ where: { id: planId }, data: { active: false } });
    return { archived: true };
  }

  async deleteItem(itemId: string) {
    await this.assertItem(itemId);
    await this.prisma.$transaction([
      this.prisma.maintenanceItem.update({ where: { id: itemId }, data: { active: false } }),
      this.prisma.notificationTopic.updateMany({
        where: { entityType: 'MAINTENANCE_ITEM', entityId: itemId }, data: { active: false },
      }),
    ]);
    return { archived: true };
  }

  async getAssetMaintenance(assetId: string, role?: Role) {
    if (role === Role.OPERATOR) {
      await this.assertHourlyAsset(assetId, true);
    }
    const scheduleType = await this.assetScheduleType(assetId);
    return this.getSubjectMaintenance('assetId', assetId, scheduleType);
  }

  getVehicleMaintenance(vehicleId: string) {
    return this.getSubjectMaintenance('vehicleId', vehicleId, 'HOURS');
  }

  async recordAssetHours(
    assetId: string,
    payload: RecordAssetHoursDto,
    userId: string,
    role: Role,
  ) {
    await this.assertHourlyAsset(assetId, role === Role.OPERATOR);
    if (payload.operatorReportedHours == null) {
      throw new BadRequestException('Debes ingresar las horas reportadas por el operario');
    }
    if (!payload.evidenceFileObjectId) {
      throw new BadRequestException('Debes adjuntar una evidencia fotográfica');
    }
    await this.assertHourEvidence(assetId, payload.evidenceFileObjectId, userId);
    return this.recordHours('asset', assetId, payload, userId);
  }

  recordVehicleHours(vehicleId: string, payload: RecordAssetHoursDto, userId: string) {
    return this.recordHours('vehicle', vehicleId, payload, userId);
  }

  async completeItem(itemId: string, payload: CompleteMaintenanceDto, userId: string) {
    const performedByUserId = await this.resolvePerformer(payload.performedByUserId, userId);
    const item = await this.prisma.maintenanceItem.findUnique({
      where: { id: itemId },
      include: {
        plan: {
          select: {
            assetId: true,
            vehicleId: true,
            asset: { select: { sku: { select: { chargeType: true } } } },
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Maintenance item not found');
    const scheduleType: MaintenanceScheduleType = item.plan.asset?.sku.chargeType === ChargeType.DAY
      ? 'CALENDAR_DAYS'
      : 'HOURS';
    const completedAt = payload.completedAt ? new Date(payload.completedAt) : new Date();
    const latestCompletion = await this.prisma.maintenanceCompletion.findFirst({
      where: { itemId }, orderBy: { completedAt: 'desc' },
    });

    if (scheduleType === 'CALENDAR_DAYS') {
      if (latestCompletion && completedAt < latestCompletion.completedAt) {
        throw new BadRequestException('Completion date cannot be earlier than the previous completion');
      }
      return this.prisma.maintenanceCompletion.create({
        data: {
          itemId,
          completedAtHours: null,
          completedAt,
          notes: payload.notes?.trim() || null,
          performedByUserId,
          completedByUserId: userId,
        },
      });
    }

    const currentHours = item.plan.assetId
      ? Number((await this.prisma.asset.findUniqueOrThrow({
          where: { id: item.plan.assetId }, select: { hourMeter: true },
        })).hourMeter)
      : Number((await this.prisma.vehicleHourReading.findFirst({
          where: { vehicleId: item.plan.vehicleId! }, orderBy: { hours: 'desc' },
        }))?.hours ?? 0);
    const completedAtHours = payload.completedAtHours ?? currentHours;
    if (completedAtHours > currentHours) throw new BadRequestException('Completion hours cannot exceed current hours');
    if (
      latestCompletion?.completedAtHours != null
      && completedAtHours < Number(latestCompletion.completedAtHours)
    ) {
      throw new BadRequestException('Completion hours cannot be lower than the previous completion');
    }
    return this.prisma.maintenanceCompletion.create({
      data: {
        itemId, completedAtHours,
        completedAt,
        notes: payload.notes?.trim() || null, performedByUserId, completedByUserId: userId,
      },
    });
  }

  private async getSubjectMaintenance(
    subjectField: 'assetId' | 'vehicleId',
    subjectId: string,
    scheduleType: MaintenanceScheduleType,
  ) {
    if (subjectField === 'assetId') await this.assertAsset(subjectId);
    else await this.assertVehicle(subjectId);
    const readings = scheduleType === 'CALENDAR_DAYS'
      ? []
      : subjectField === 'assetId'
      ? await this.prisma.assetHourReading.findMany({
        where: { assetId: subjectId },
        orderBy: { recordedAt: 'desc' },
        take: 100,
        include: {
          recordedBy: {
            select: {
              email: true,
              employee: { select: { name: true, lastName: true } },
            },
          },
        },
      })
      : await this.prisma.vehicleHourReading.findMany({
        where: { vehicleId: subjectId },
        orderBy: { recordedAt: 'desc' },
        take: 100,
        include: {
          recordedBy: {
            select: {
              email: true,
              employee: { select: { name: true, lastName: true } },
            },
          },
        },
      });
    const currentHours = scheduleType === 'CALENDAR_DAYS'
      ? null
      : subjectField === 'assetId'
      ? Number((await this.prisma.asset.findUniqueOrThrow({ where: { id: subjectId }, select: { hourMeter: true } })).hourMeter)
      : readings.length
        ? Number(readings.reduce((max, reading) => Number(reading.hours) > Number(max.hours) ? reading : max).hours)
        : 0;
    const plans = await this.prisma.maintenancePlan.findMany({
      where: { [subjectField]: subjectId }, orderBy: { createdAt: 'asc' }, include: { items: { include: { completions: {
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }], take: 1,
        include: { item: { select: { id: true, name: true, planId: true } }, completedBy: { select: { email: true, employee: { select: { name: true, lastName: true } } } }, performedBy: { select: { email: true, employee: { select: { name: true, lastName: true } } } } },
      } } } },
    });
    const topics = await this.prisma.notificationTopic.findMany({
      where: { entityType: 'MAINTENANCE_ITEM', entityId: { in: plans.flatMap((plan) => plan.items.map((item) => item.id)) } },
      include: { recipients: { include: { user: { select: { id: true, email: true, active: true, employee: true } } } } },
    });
    const topicByItem = new Map(topics.map((topic) => [topic.entityId, topic]));
    const completions = await this.prisma.maintenanceCompletion.findMany({
      where: { item: { plan: { [subjectField]: subjectId } } },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        item: { select: { id: true, name: true, planId: true } },
        performedBy: { select: { email: true, employee: { select: { name: true, lastName: true } } } },
        completedBy: { select: { email: true, employee: { select: { name: true, lastName: true } } } },
      },
    });
    return {
      scheduleType,
      completions,
      currentHours,
      readings,
      plans: plans.map((plan) => ({
        ...plan, items: plan.items.map((item) => ({ ...item, notificationTopic: topicByItem.get(item.id) ?? null })),
      })),
    };
  }

  private async recordHours(subject: 'asset' | 'vehicle', id: string, payload: RecordAssetHoursDto, userId: string) {
    if (subject === 'asset') await this.assertAsset(id); else await this.assertVehicle(id);
    return this.prisma.$transaction(async (tx) => {
      const latestHours = subject === 'asset'
        ? Number((await tx.asset.findUniqueOrThrow({
            where: { id }, select: { hourMeter: true },
          })).hourMeter)
        : Number((await tx.vehicleHourReading.findFirst({
            where: { vehicleId: id }, orderBy: { hours: 'desc' },
          }))?.hours ?? 0);
      if (payload.hours < latestHours) {
        throw new BadRequestException(`Hours cannot decrease below ${latestHours}`);
      }
      const data = {
        hours: payload.hours, recordedAt: payload.recordedAt ? new Date(payload.recordedAt) : new Date(),
        note: payload.note?.trim() || null, recordedByUserId: userId,
      };
      if (payload.hours === latestHours && subject === 'vehicle') {
        return { hours: latestHours, unchanged: true };
      }
      if (subject === 'asset') {
        await tx.asset.update({ where: { id }, data: { hourMeter: payload.hours } });
        return tx.assetHourReading.create({
          data: {
            ...data,
            assetId: id,
            previousHours: latestHours,
            operatorReportedHours: payload.operatorReportedHours,
            evidenceFileObjectId: payload.evidenceFileObjectId,
          },
        });
      }
      return tx.vehicleHourReading.create({ data: { ...data, vehicleId: id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async planWithTopics(planId: string, db: Prisma.TransactionClient) {
    const plan = await db.maintenancePlan.findUniqueOrThrow({ where: { id: planId }, include: { items: true } });
    const topics = await db.notificationTopic.findMany({
      where: { entityType: 'MAINTENANCE_ITEM', entityId: { in: plan.items.map((item) => item.id) } },
      include: { recipients: true },
    });
    return { ...plan, items: plan.items.map((item) => ({
      ...item, notificationTopic: topics.find((topic) => topic.entityId === item.id) ?? null,
    })) };
  }

  private assertSingleSubject(assetId?: string, vehicleId?: string) {
    if ((!assetId && !vehicleId) || (assetId && vehicleId)) {
      throw new BadRequestException('Provide exactly one of assetId or vehicleId');
    }
  }

  private async assertAsset(id: string) {
    if (!await this.prisma.asset.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Asset not found');
  }

  private async assetScheduleType(assetId: string): Promise<MaintenanceScheduleType> {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { sku: { select: { chargeType: true } } },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset.sku.chargeType === ChargeType.HOUR ? 'HOURS' : 'CALENDAR_DAYS';
  }

  private async subjectScheduleType(assetId?: string, vehicleId?: string): Promise<MaintenanceScheduleType> {
    if (assetId) return this.assetScheduleType(assetId);
    await this.assertVehicle(vehicleId!);
    return 'HOURS';
  }

  private async planScheduleType(planId: string): Promise<MaintenanceScheduleType> {
    const plan = await this.prisma.maintenancePlan.findUnique({
      where: { id: planId },
      select: {
        vehicleId: true,
        asset: { select: { sku: { select: { chargeType: true } } } },
      },
    });
    if (!plan) throw new NotFoundException('Maintenance plan not found');
    return plan.asset?.sku.chargeType === ChargeType.DAY ? 'CALENDAR_DAYS' : 'HOURS';
  }

  private async itemScheduleType(itemId: string): Promise<MaintenanceScheduleType> {
    const item = await this.prisma.maintenanceItem.findUnique({
      where: { id: itemId },
      select: {
        plan: {
          select: {
            asset: { select: { sku: { select: { chargeType: true } } } },
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Maintenance item not found');
    return item.plan.asset?.sku.chargeType === ChargeType.DAY ? 'CALENDAR_DAYS' : 'HOURS';
  }

  private createScheduleData(payload: CreateMaintenanceItemDto, scheduleType: MaintenanceScheduleType) {
    if (scheduleType === 'CALENDAR_DAYS') {
      if (payload.intervalDays == null) {
        throw new BadRequestException('intervalDays is required for calendar-day maintenance');
      }
      return {
        intervalHours: null,
        warningHours: null,
        baselineHours: null,
        intervalDays: payload.intervalDays,
        warningDays: payload.warningDays ?? 7,
        baselineDate: payload.baselineDate ? new Date(payload.baselineDate) : new Date(),
      };
    }
    if (payload.intervalHours == null) {
      throw new BadRequestException('intervalHours is required for hour-meter maintenance');
    }
    return {
      intervalHours: payload.intervalHours,
      warningHours: payload.warningHours ?? 10,
      baselineHours: payload.baselineHours ?? 0,
      intervalDays: null,
      warningDays: null,
      baselineDate: null,
    };
  }

  private updateScheduleData(payload: UpdateMaintenanceItemDto, scheduleType: MaintenanceScheduleType) {
    if (scheduleType === 'CALENDAR_DAYS') {
      return {
        intervalDays: payload.intervalDays,
        warningDays: payload.warningDays,
        baselineDate: payload.baselineDate === undefined ? undefined : new Date(payload.baselineDate),
        intervalHours: null,
        warningHours: null,
        baselineHours: null,
      };
    }
    return {
      intervalHours: payload.intervalHours,
      warningHours: payload.warningHours,
      baselineHours: payload.baselineHours,
      intervalDays: null,
      warningDays: null,
      baselineDate: null,
    };
  }

  private async assertHourlyAsset(id: string, requireOwnWarehouse: boolean) {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      select: {
        id: true,
        sku: { select: { chargeType: true } },
        warehouseOwner: { select: { type: true } },
      },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    if (asset.sku.chargeType !== ChargeType.HOUR) {
      throw new BadRequestException('Hour readings only apply to hourly assets');
    }
    if (requireOwnWarehouse && asset.warehouseOwner.type !== WarehouseType.OWN) {
      throw new ForbiddenException('Operators can only update assets from own warehouses');
    }
  }

  private async assertHourEvidence(assetId: string, fileObjectId: string, userId: string) {
    const evidence = await this.prisma.fileObject.findFirst({
      where: {
        id: fileObjectId,
        entityType: 'ASSET',
        entityId: assetId,
        category: { in: [...HOUR_METER_EVIDENCE_CATEGORIES] },
        createdBy: userId,
        mimeType: { startsWith: 'image/' },
      },
      select: { id: true },
    });
    if (!evidence) {
      throw new BadRequestException('La evidencia fotográfica no es válida');
    }
  }

  private async assertVehicle(id: string) {
    if (!await this.prisma.vehicle.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Vehicle not found');
  }

  private async assertPlan(id: string) {
    if (!await this.prisma.maintenancePlan.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Maintenance plan not found');
  }

  private async assertItem(id: string) {
    if (!await this.prisma.maintenanceItem.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('Maintenance item not found');
  }
}
