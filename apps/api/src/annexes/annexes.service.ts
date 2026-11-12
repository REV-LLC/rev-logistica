import { assertDailyAnnex } from './annex-daily-scope';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { annexInputSchema } from './annex-input';
import { calculateAnnex } from './annex-engine';
import { minimumSettings, worksiteMinimumKey } from './annex-minimums';
import { WorksiteLossService } from '../inventory/worksite-loss.service';
import { applyInventoryLosses } from './annex-inventory-losses';
import { inventoryBusinessDay } from '../inventory/business-date-ledger-order';
const saveSchema = z
  .object({
    customerWorksiteId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    invoiceNumber: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[^\r\n\x00-\x1F]+$/)
      .transform((value) => value.toLocaleUpperCase('es-CO'))
      .pipe(z.string().max(80))
      .nullable()
      .optional(),
    reason: z.string().trim().min(1).max(500),
    input: annexInputSchema,
    sourceIssues: z
      .array(
        z
          .object({
            code: z.string().max(100),
            reference: z.string().max(200),
            message: z.string().max(500),
          })
          .strict(),
      )
      .max(1000)
      .default([]),
  })
  .strict();
@Injectable()
export class AnnexesService {
  constructor(private readonly prisma: PrismaService, private readonly losses: WorksiteLossService) {}
  async list(customerWorksiteId: string) {
    if (!z.string().uuid().safeParse(customerWorksiteId).success)
      throw new BadRequestException('Obra inválida');
    return this.prisma.annexDraft.findMany({
      where: { customerWorksiteId },
      orderBy: { periodFrom: 'desc' },
      take: 100,
      include: { revisions: { orderBy: { revision: 'desc' }, take: 1 } },
    });
  }
  async library(query: {
    customerId?: string;
    customerWorksiteId?: string;
    cursor?: string;
  }) {
    const parsed = z
      .object({
        customerId: z.string().uuid().optional(),
        customerWorksiteId: z.string().uuid().optional(),
        cursor: z.string().uuid().optional(),
      })
      .strict()
      .safeParse(query);
    if (!parsed.success)
      throw new BadRequestException(
        'El cliente, la obra o la página no son válidos',
      );
    const { customerId, customerWorksiteId, cursor } = parsed.data;
    if (customerWorksiteId) {
      const site = await this.prisma.customerWorksite.findUnique({
        where: { id: customerWorksiteId },
        select: {
          id: true,
          alias: true,
          customer: { select: { id: true, name: true } },
          worksite: { select: { name: true } },
        },
      });
      if (!site || (customerId && site.customer.id !== customerId))
        throw new NotFoundException(
          'La obra no pertenece al cliente seleccionado',
        );
      if (
        cursor &&
        !(await this.prisma.annexDraft.findFirst({
          where: { id: cursor, customerWorksiteId },
          select: { id: true },
        }))
      )
        throw new BadRequestException('Página de anexos inválida');
      const rows = await this.prisma.annexDraft.findMany({
        where: { customerWorksiteId },
        orderBy: [{ periodFrom: 'desc' }, { id: 'desc' }],
        take: 51,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          revision: true,
          periodFrom: true,
          periodTo: true,
          revisions: {
            orderBy: { revision: 'desc' },
            take: 1,
            select: {
              revision: true,
              through: true,
              invoiceNumber: true,
              createdAt: true,
            },
          },
        },
      });
      return {
        customer: site.customer,
        worksite: { id: site.id, name: site.alias || site.worksite.name },
        annexes: rows.slice(0, 50),
        nextCursor: rows.length > 50 ? rows[49].id : null,
      };
    }
    if (cursor)
      throw new BadRequestException(
        'Selecciona una obra para consultar sus anexos',
      );
    if (customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          name: true,
          customerWorksites: {
            orderBy: { worksite: { name: 'asc' } },
            select: {
              id: true,
              alias: true,
              worksite: { select: { name: true } },
              _count: { select: { annexDrafts: true } },
            },
          },
        },
      });
      if (!customer) throw new NotFoundException('Cliente no encontrado');
      return {
        customer: { id: customer.id, name: customer.name },
        worksites: customer.customerWorksites.map((site) => ({
          id: site.id,
          name: site.alias || site.worksite.name,
          annexCount: site._count.annexDrafts,
        })),
      };
    }
    return {
      customers: (
        await this.prisma.customer.findMany({
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            _count: { select: { customerWorksites: true } },
          },
        })
      ).map((customer) => ({
        id: customer.id,
        name: customer.name,
        worksiteCount: customer._count.customerWorksites,
      })),
    };
  }
  async get(id: string) {
    const draft = await this.prisma.annexDraft.findUnique({
      where: { id },
      include: { revisions: { orderBy: { revision: 'desc' }, take: 1 } },
    });
    if (!draft) throw new NotFoundException('Borrador no encontrado');
    return draft;
  }
  async history(id: string) {
    await this.get(id);
    return this.prisma.annexDraftRevision.findMany({
      where: { draftId: id },
      orderBy: { revision: 'desc' },
      select: {
        revision: true,
        through: true,
        reason: true,
        createdBy: true,
        createdAt: true,
        invoiceNumber: true,
      },
    });
  }
  async save(value: unknown, userId: string) {
    const parsed = saveSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      );
    const {
      input,
      customerWorksiteId,
      expectedRevision,
      reason,
      sourceIssues,
    } = parsed.data;
    assertDailyAnnex(input);
    const periodFrom = new Date(`${input.period.from}T00:00:00Z`);
    const periodTo = new Date(`${input.period.to}T00:00:00Z`);
    const savedDraft = await this.prisma.$transaction(async (tx) => {
      const site = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM "CustomerWorksite" WHERE id = ${customerWorksiteId} FOR UPDATE
      `);
      if (!site.length) throw new NotFoundException('Obra no encontrada');
      const employeeIds = [
        ...new Set(
          input.machineDays.flatMap((day) =>
            day.reports.map((report) => report.employeeId),
          ),
        ),
      ];
      if (
        employeeIds.length &&
        (await tx.employee.count({ where: { id: { in: employeeIds } } })) !==
          employeeIds.length
      ) {
        throw new BadRequestException(
          'Hay operarios que no existen en el registro de empleados',
        );
      }
      const skuIds = [
        ...new Set(
          input.rentals
            .filter((rental) => !rental.accessoryId)
            .map((rental) => rental.skuId),
        ),
      ];
      if (
        skuIds.length &&
        (await tx.sku.count({ where: { id: { in: skuIds } } })) !==
          skuIds.length
      ) {
        throw new BadRequestException(
          'Hay referencias que no existen en el catálogo',
        );
      }
      const accessoryIds = [
        ...new Set([
          ...input.rentals.flatMap((r) =>
            r.accessoryId ? [r.accessoryId] : [],
          ),
          ...input.machineDays.flatMap((d) =>
            d.rentalContext?.accessoryId ? [d.rentalContext.accessoryId] : [],
          ),
        ]),
      ];
      if (
        accessoryIds.length &&
        (await tx.accessory.count({ where: { id: { in: accessoryIds } } })) !==
          accessoryIds.length
      )
        throw new BadRequestException(
          'Hay accesorios inexistentes en el anexo',
        );
      const assetIds = [
        ...new Set([
          ...input.machineDays
            .filter((day) => !day.rentalContext?.accessoryId)
            .map((day) => day.assetId),
          ...input.rentals.flatMap((rental) =>
            rental.assetId ? [rental.assetId] : [],
          ),
        ]),
      ];
      const assets = assetIds.length
        ? await tx.asset.findMany({
            where: { id: { in: assetIds } },
            select: { id: true, skuId: true },
          })
        : [];
      if (
        assets.length !== assetIds.length ||
        input.rentals.some(
          (rental) =>
            rental.assetId &&
            !assets.some(
              (asset) =>
                asset.id === rental.assetId && asset.skuId === rental.skuId,
            ),
        )
      ) {
        throw new BadRequestException(
          'Hay máquinas inexistentes o que no corresponden a la referencia seleccionada',
        );
      }
      const overlaps = await tx.annexDraft.findMany({
        where: {
          customerWorksiteId,
          periodFrom: { lte: periodTo },
          periodTo: { gte: periodFrom },
        },
        include: {
          revisions: {
            orderBy: { revision: 'desc' },
            take: 1,
            select: { invoiceNumber: true, input: true },
          },
        },
      });
      const current = overlaps.find(
        (d) =>
          d.periodFrom.getTime() === periodFrom.getTime() &&
          d.periodTo.getTime() === periodTo.getTime(),
      );
      if (overlaps.some((d) => d.id !== current?.id))
        throw new ConflictException(
          'Ya existe un borrador con un período solapado',
        );
      if ((current?.revision ?? 0) !== expectedRevision)
        throw new ConflictException(
          'El borrador cambió. Carga la última revisión antes de guardar',
        );
      const previousInput = annexInputSchema.safeParse(current?.revisions?.[0]?.input);
      const previousCharges = previousInput.success ? previousInput.data.additionalCharges ?? [] : [];
      const nextCharges = input.additionalCharges ?? [];
      for (const old of previousCharges) {
        if (!old.inventoryLoss) continue;
        const next = nextCharges.find(charge => charge.id === old.id);
        if (!next || next.type !== 'REPLACEMENT' || next.skuId !== old.skuId || next.assetId !== old.assetId
          || next.quantity !== old.quantity || JSON.stringify(next.inventoryLoss) !== JSON.stringify(old.inventoryLoss)) {
          throw new ConflictException('La reposición ya tiene una baja registrada. No se puede quitar ni modificar su pérdida desde el anexo');
        }
      }
      const revision = expectedRevision + 1;
      const draft = current
        ? await tx.annexDraft.update({
            where: { id: current.id },
            data: { revision },
          })
        : await tx.annexDraft.create({
            data: { customerWorksiteId, periodFrom, periodTo, revision },
          });
      for (const charge of [...nextCharges].sort((a, b) => (a.skuId ?? '').localeCompare(b.skuId ?? ''))) {
        if (charge.type !== 'REPLACEMENT') continue;
        if (!charge.inventoryLoss) {
          const legacy = previousCharges.find(old => old.id === charge.id && old.type === 'REPLACEMENT' && !old.inventoryLoss);
          if (legacy && JSON.stringify(legacy) === JSON.stringify(charge)) continue;
          throw new BadRequestException('La reposición debe indicar referencia, dueño, fecha, motivo y responsable de la pérdida');
        }
        if (!charge.skuId) throw new BadRequestException('Selecciona la referencia de la reposición');
        const detail = charge.inventoryLoss;
        if (detail.date > input.period.through) throw new BadRequestException('La pérdida no puede ser posterior al corte del anexo');
        const annexChargeKey = `${draft.id}:${charge.id}`;
        if (detail.lossId) {
          const loss = await tx.worksiteInventoryLoss.findUnique({ where: { id: detail.lossId } });
          if (!loss || loss.customerWorksiteId !== customerWorksiteId || loss.skuId !== charge.skuId || loss.assetId !== (charge.assetId ?? null)
            || loss.ownerWarehouseId !== detail.ownerWarehouseId || !loss.quantity.eq(charge.quantity)
            || inventoryBusinessDay(loss.effectiveAt) !== detail.date || loss.reason !== detail.reason || loss.responsible !== detail.responsible) throw new BadRequestException('La reposición no coincide con la pérdida seleccionada');
          if (loss.annexChargeKey && loss.annexChargeKey !== annexChargeKey) throw new ConflictException('Esta pérdida ya está vinculada a otra reposición');
          await tx.worksiteInventoryLoss.update({ where: { id: loss.id }, data: { annexChargeKey } });
        } else {
          const loss = await this.losses.record(tx, {
            customerWorksiteId, skuId: charge.skuId, assetId: charge.assetId,
            ownerWarehouseId: detail.ownerWarehouseId, quantity: charge.quantity,
            date: detail.date, reason: detail.reason, responsible: detail.responsible,
          }, userId, `annex:${draft.id}:${charge.id}`, annexChargeKey);
          detail.lossId = loss.id;
        }
      }
      const recorded = await tx.worksiteInventoryLoss.findMany({ where: { customerWorksiteId } });
      applyInventoryLosses(input, recorded);
      const result = calculateAnnex(input);
      const saved = await tx.annexDraftRevision.create({
        data: {
          draftId: draft.id,
          invoiceNumber:
            parsed.data.invoiceNumber === undefined
              ? (current?.revisions?.[0]?.invoiceNumber ?? null)
              : parsed.data.invoiceNumber,
          revision,
          through: new Date(`${input.period.through}T00:00:00Z`),
          input: input as Prisma.InputJsonValue,
          result: result as unknown as Prisma.InputJsonValue,
          reason,
          sourceIssues,
          createdBy: userId,
        },
      });
      if (input.policy.rememberMinimums) {
        const key = worksiteMinimumKey(customerWorksiteId);
        const existing = minimumSettings(
          (await tx.appSetting.findUnique({ where: { key } }))?.value,
        );
        const patch = minimumSettings(input.policy.rememberMinimums);
        const value = {
          days: { ...existing.days, ...patch.days },
          hours: { ...existing.hours, ...patch.hours },
        };
        await tx.appSetting.upsert({
          where: { key },
          create: { key, value, category: 'ANNEX_COMMERCIAL' },
          update: { value },
        });
      }
      return { ...draft, revisions: [saved] };
    }, { timeout: 30000 });
    await this.losses.invalidate(customerWorksiteId, (input.additionalCharges ?? []).flatMap(charge => charge.inventoryLoss ? [charge.inventoryLoss.ownerWarehouseId] : []));
    return savedDraft;
  }

  async preview(value: unknown, siteId: string, userId: string) {
    if (!z.string().uuid().safeParse(siteId).success) throw new BadRequestException('Obra inválida');
    const parsed = annexInputSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('El anexo no es válido');
    const input = assertDailyAnnex(parsed.data);
    return this.prisma.$transaction(async tx => {
      const recorded = await tx.worksiteInventoryLoss.findMany({ where: { customerWorksiteId: siteId } });
      const pending = [] as typeof recorded;
      for (const charge of (input.additionalCharges ?? []).filter(row => row.type === 'REPLACEMENT' && row.inventoryLoss && !row.inventoryLoss.lossId)
        .sort((a, b) => (a.skuId ?? '').localeCompare(b.skuId ?? ''))) {
        const detail = charge.inventoryLoss!;
        if (!charge.skuId || detail.date > input.period.through) throw new BadRequestException('La fecha de pérdida debe estar dentro del corte consultado');
        pending.push(await this.losses.record(tx, {
          customerWorksiteId: siteId, skuId: charge.skuId, assetId: charge.assetId,
          ownerWarehouseId: detail.ownerWarehouseId, quantity: charge.quantity,
          date: detail.date, reason: detail.reason, responsible: detail.responsible,
        }, userId, `pending:${charge.id}`, undefined, true));
      }
      applyInventoryLosses(input, [...recorded, ...pending]);
      return calculateAnnex(input);
    }, { timeout: 30000 });
  }
}
