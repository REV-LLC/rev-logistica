import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { civilDate } from '../common/civil-date';
import { inventoryBusinessDay } from './business-date-ledger-order';
import { lockBulkStock } from './bulk-stock-lock';
import { InventoryService } from './inventory.service';
import { planWorksiteLoss } from './worksite-loss-plan';

export const worksiteLossSchema = z.object({
  requestId: z.string().uuid(),
  customerWorksiteId: z.string().uuid(),
  skuId: z.string().uuid(),
  assetId: z.string().uuid().optional(),
  ownerWarehouseId: z.string().uuid(),
  quantity: z.string().regex(/^[1-9]\d{0,5}$/),
  date: z.string(),
  reason: z.string().trim().min(5).max(500),
  responsible: z.string().trim().min(2).max(160),
}).strict();
export type WorksiteLossInput = z.infer<typeof worksiteLossSchema>;

@Injectable()
export class WorksiteLossService {
  constructor(private readonly prisma: PrismaService, private readonly inventory: InventoryService) {}

  async create(value: unknown, userId: string) {
    const parsed = worksiteLossSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('Completa la referencia, dueño, cantidad, fecha, motivo y responsable de la pérdida');
    const { requestId, ...input } = parsed.data;
    const result = await this.prisma.$transaction(tx => this.record(tx, input, userId, `manual:${requestId}`));
    await this.invalidate(parsed.data.customerWorksiteId, [parsed.data.ownerWarehouseId]);
    return result;
  }

  async invalidate(siteId: string, ownerIds: string[]) {
    const locations = await this.prisma.stockLedger.findMany({ where: { customerWorksiteId: siteId, warehouseId: { not: null } }, distinct: ['warehouseId'], select: { warehouseId: true } });
    await this.inventory.invalidateDocumentMovementCaches([...ownerIds, ...locations.flatMap(row => row.warehouseId ? [row.warehouseId] : [])], siteId);
  }

  async list(siteId: string, skuId?: string) {
    if (!z.string().uuid().safeParse(siteId).success || (skuId && !z.string().uuid().safeParse(skuId).success)) throw new BadRequestException('Obra o referencia inválida');
    return this.prisma.worksiteInventoryLoss.findMany({
      where: { customerWorksiteId: siteId, ...(skuId ? { skuId } : {}) },
      orderBy: [{ effectiveAt: 'desc' }, { id: 'desc' }], take: 500,
    });
  }

  async record(tx: Prisma.TransactionClient, input: Omit<WorksiteLossInput, 'requestId'>, userId: string, requestKey: string, annexChargeKey?: string, preview = false) {
    if (!worksiteLossSchema.omit({ requestId: true }).safeParse(input).success) throw new BadRequestException('Los datos de la pérdida no son válidos');
    civilDate(input.date);
    if (input.date > inventoryBusinessDay(new Date())) throw new BadRequestException('La fecha de pérdida no puede ser futura');
    const sites = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "CustomerWorksite" WHERE id = ${input.customerWorksiteId} FOR UPDATE`);
    if (!sites.length) throw new NotFoundException('Obra no encontrada');
    const existing = await tx.worksiteInventoryLoss.findUnique({ where: { requestKey } });
    if (existing) {
      if (existing.customerWorksiteId !== input.customerWorksiteId || existing.skuId !== input.skuId || existing.assetId !== (input.assetId ?? null)
        || existing.ownerWarehouseId !== input.ownerWarehouseId || !existing.quantity.eq(input.quantity)
        || inventoryBusinessDay(existing.effectiveAt) !== input.date || existing.reason !== input.reason || existing.responsible !== input.responsible) {
        throw new ConflictException('Esta pérdida ya fue registrada con otros datos. No se puede modificar ni duplicar');
      }
      return existing;
    }
    await lockBulkStock(tx, [input.skuId]);
    const sku = await tx.sku.findUnique({ where: { id: input.skuId }, select: { id: true, assetFamily: { select: { controlType: true } } } });
    if (!sku) throw new NotFoundException('Referencia no encontrada');
    if ((sku.assetFamily.controlType === 'SERIAL') !== Boolean(input.assetId)) throw new BadRequestException('Identifica el equipo individual para esta referencia');
    if (input.assetId) {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Asset" WHERE id = ${input.assetId} FOR UPDATE`);
      const asset = await tx.asset.findUnique({ where: { id: input.assetId }, select: { skuId: true, warehouseOwnerId: true, active: true } });
      if (!asset || !asset.active || asset.skuId !== input.skuId || asset.warehouseOwnerId !== input.ownerWarehouseId || input.quantity !== '1') throw new BadRequestException('El equipo o su dueño no corresponden a la pérdida');
    }
    const rows = await tx.stockLedger.findMany({
      where: { customerWorksiteId: input.customerWorksiteId, ownerWarehouseId: input.ownerWarehouseId,
        ...(input.assetId ? { assetId: input.assetId } : { skuId: input.skuId, assetId: null }),
        movementType: { in: [MovementType.OUT, MovementType.ON_SITE, MovementType.IN, MovementType.TRANSIT, MovementType.LOSS] } },
      orderBy: [{ effectiveAt: 'asc' }, { appendOrder: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }, { id: 'asc' }],
      take: 50001,
      select: { id: true, quantity: true, effectiveAt: true, movementType: true, reversedByDocumentId: true, document: { select: { status: true } } },
    });
    if (rows.length > 50000 || rows.some(row => row.reversedByDocumentId || (row.document && row.document.status !== 'CONFIRMED'))) throw new BadRequestException('El historial requiere conciliación antes de registrar una pérdida');
    const dayStart = new Date(`${input.date}T05:00:00Z`);
    const sameDay = rows.filter(row => inventoryBusinessDay(row.effectiveAt) === input.date);
    const effectiveAt = new Date(Math.max(dayStart.getTime(), ...sameDay.map(row => row.effectiveAt.getTime() + 1)));
    if (inventoryBusinessDay(effectiveAt) !== input.date) throw new BadRequestException('No es posible registrar otra operación al cierre de ese día');
    if (input.assetId && rows.some(row => row.effectiveAt > effectiveAt)) throw new BadRequestException('El equipo tiene movimientos posteriores a la fecha de pérdida');
    const allocations = planWorksiteLoss(rows, effectiveAt, new Prisma.Decimal(input.quantity));
    if (preview) return {
      id: requestKey, requestKey, customerWorksiteId: input.customerWorksiteId, skuId: input.skuId, assetId: input.assetId ?? null,
      ownerWarehouseId: input.ownerWarehouseId, quantity: new Prisma.Decimal(input.quantity), effectiveAt,
      reason: input.reason, responsible: input.responsible, createdBy: userId, createdAt: new Date(), allocations,
      ledgerId: `preview:${requestKey}`, annexChargeKey: annexChargeKey ?? null,
    };
    const ledger = await tx.stockLedger.create({ data: {
      skuId: input.assetId ? null : input.skuId, assetId: input.assetId ?? null,
      ownerWarehouseId: input.ownerWarehouseId, customerWorksiteId: input.customerWorksiteId,
      warehouseId: null, movementType: MovementType.LOSS, quantity: input.quantity, effectiveAt, createdBy: userId,
    } });
    const loss = await tx.worksiteInventoryLoss.create({ data: {
      requestKey, customerWorksiteId: input.customerWorksiteId, skuId: input.skuId, assetId: input.assetId ?? null,
      ownerWarehouseId: input.ownerWarehouseId, quantity: input.quantity, effectiveAt,
      reason: input.reason, responsible: input.responsible, createdBy: userId,
      allocations, ledgerId: ledger.id, annexChargeKey,
    } });
    if (input.assetId) await tx.asset.update({ where: { id: input.assetId }, data: { active: false } });
    return loss;
  }
}
