import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { lockBulkStock } from '../inventory/bulk-stock-lock';
import { promotionFingerprint, replacePromotedSelector } from './implement-promotion.service';

type Input = { accessoryId: string; skuId: string; effectiveAt: Date; quantity: number; confirmation: string };
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

/** Reviewed whole-balance cutover only. Historical documents and stock stay untouched. */
export class BulkImplementPromotionService {
  async preview(tx: Prisma.TransactionClient, input: Input, userId: string) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(input.accessoryId) || !uuid.test(input.skuId) || !Number.isSafeInteger(input.quantity) || input.quantity < 1 ||
      !(input.effectiveAt instanceof Date) || !Number.isFinite(input.effectiveAt.getTime()) ||
      typeof input.confirmation !== 'string' || input.confirmation.trim().length < 10 || input.confirmation.length > 500)
      throw new BadRequestException('Indica identidades, cantidad y confirmación explícitas para el empalme BULK.');
    const actor = await tx.user.findUnique({ where: { id: userId }, select: { id: true, active: true, role: true } });
    if (!actor?.active || !['ADMIN', 'OFFICE'].includes(actor.role)) throw new BadRequestException('Office o Admin debe revisar el empalme.');
    const existing = await tx.implementIdentityBridge.findUnique({ where: { accessoryId: input.accessoryId } });
    if (existing) {
      const evidence = existing.evidenceSnapshot as any;
      if (existing.skuId !== input.skuId || existing.effectiveAt.getTime() !== input.effectiveAt.getTime() ||
        promotionFingerprint(evidence.before?.input) !== promotionFingerprint(input))
        throw new ConflictException('Esta identidad ya tiene otro empalme revisado.');
      return { status: 'PROMOTED' as const, bridge: existing };
    }
    const source = await tx.accessory.findUniqueOrThrow({ where: { id: input.accessoryId }, include: {
      balances: { orderBy: { id: 'asc' } }, movements: { orderBy: { id: 'asc' } }, revisions: { orderBy: { id: 'asc' } },
      assets: { orderBy: { assetId: 'asc' } }, subfamilies: { orderBy: { subfamilyId: 'asc' } },
      compatibleParents: true, compatibleChildren: true, configuration: true,
    } });
    const positive = source.balances.filter(row => row.quantity > 0);
    if (!source.active || source.kind === 'CONSUMABLE' || source.exclusiveAssetId || source.scope === 'ACCESSORIES' ||
      source.compatibleParents.length || source.compatibleChildren.length || source.configuration ||
      positive.length !== 1 || positive[0].warehouseId !== source.ownerWarehouseId || positive[0].assetId ||
      positive[0].customerWorksiteId || positive[0].transitDocumentId ||
      source.balances.some(row => !Number.isSafeInteger(row.quantity) || row.quantity < 0) ||
      source.balances.reduce((n, row) => n + row.quantity, 0) !== input.quantity)
      throw new BadRequestException('Solo se convierte una cantidad retornable íntegra en la bodega de su propietario.');
    if (await tx.documentItem.count({ where: { accessoryId: source.id } }) ||
      source.movements.some(row => row.documentId || row.type === 'CONSUME') ||
      await tx.accessoryProviderReceiptItem.count({ where: { sourceMovement: { accessoryId: source.id } } }))
      throw new BadRequestException('Un implemento BULK con documentos necesita un empalme documental específico.');
    if (input.effectiveAt.getTime() < Math.max(source.createdAt.getTime(), ...source.movements.map(row => row.createdAt.getTime())))
      throw new BadRequestException('El empalme no puede preceder la evidencia anterior.');
    const sku = await tx.sku.findUniqueOrThrow({ where: { id: input.skuId }, include: { assetFamily: true } });
    if (!sku.active || sku.assetFamily.controlType !== 'BULK' || !sku.isImplement || sku.isConsumable ||
      await tx.stockLedger.count({ where: { skuId: sku.id } }))
      throw new BadRequestException('Selecciona una referencia BULK retornable nueva y sin existencias previas.');
    const configurations = await tx.equipmentConfiguration.findMany({ where: { entries: { some: { accessoryId: source.id } } },
      include: { entries: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' } });
    if (configurations.some(row => row.accessoryId)) throw new BadRequestException('El conjunto anidado requiere revisión.');
    const profiles = await tx.commercialProfile.findMany({ include: { revisions: { orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }] } },
      orderBy: { id: 'asc' } });
    const referencing = profiles.filter(profile => profile.scopeType === 'ACCESSORY' && profile.scopeId === source.id ||
      profile.revisions.some(rev => promotionFingerprint(replacePromotedSelector(rev.payload, source.id, 'native')) !== promotionFingerprint(rev.payload)));
    if (referencing.length) throw new BadRequestException('Revisa las tarifas antiguas antes de convertir este implemento BULK.');
    const evidence = { input, actor, source, sku, configurations };
    return { status: 'READY' as const, fingerprint: promotionFingerprint(evidence), evidence };
  }

  async apply(tx: Prisma.TransactionClient, input: Input, userId: string, expectedFingerprint: string) {
    if (!/^[0-9a-f]{64}$/.test(expectedFingerprint)) throw new BadRequestException('Revisa primero la vista previa.');
    await tx.$queryRaw`SELECT id FROM "Accessory" WHERE id=${input.accessoryId} FOR UPDATE`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('equipment-configuration',0))::text`;
    await lockBulkStock(tx, [input.skuId]);
    const plan = await this.preview(tx, input, userId);
    if (plan.status === 'PROMOTED') {
      if ((plan.bridge.evidenceSnapshot as any).planFingerprint !== expectedFingerprint) throw new ConflictException('La clave de revisión no coincide.');
      return { ...plan, replayed: true };
    }
    if (plan.fingerprint !== expectedFingerprint) throw new ConflictException('El inventario cambió desde la revisión.');
    const { source, sku, configurations } = plan.evidence;
    const opening = await tx.stockLedger.create({ data: { skuId: sku.id, ownerWarehouseId: source.ownerWarehouseId,
      warehouseId: source.ownerWarehouseId, quantity: input.quantity, movementType: 'ADJUST', isOpeningBalance: true,
      effectiveAt: input.effectiveAt, createdBy: userId } });
    for (const previous of configurations) {
      await tx.equipmentConfigurationEntry.updateMany({ where: { configurationId: previous.id, accessoryId: source.id },
        data: { accessoryId: null, skuId: sku.id, required: false, maximumQuantity: null, recommendation: true } });
      const saved = await tx.equipmentConfiguration.update({ where: { id: previous.id }, data: { version: { increment: 1 } },
        include: { entries: { orderBy: { id: 'asc' } } } });
      await tx.equipmentConfigurationRevision.create({ data: { configurationId: saved.id, before: json(previous), after: json(saved), createdBy: userId } });
    }
    // Preserve only explicit per-equipment links, never infer compatibility from a family.
    for (const link of source.assets.filter(link => !configurations.some(row => row.assetId === link.assetId))) {
      const previous = await tx.equipmentConfiguration.findUnique({ where: { assetId: link.assetId }, include: { entries: true } });
      const parent = previous ?? await tx.equipmentConfiguration.create({ data: { assetId: link.assetId } });
      await tx.equipmentConfigurationEntry.create({ data: { configurationId: parent.id, skuId: sku.id, role: 'ACCESSORY',
        quantity: 1, required: false, defaultIncluded: false, recommendation: true, sortOrder: previous?.entries.length ?? 0 } });
      const saved = await tx.equipmentConfiguration.update({ where: { id: parent.id }, data: { version: { increment: 1 } }, include: { entries: true } });
      await tx.equipmentConfigurationRevision.create({ data: { configurationId: saved.id, before: json(previous ?? { entries: [] }), after: json(saved), createdBy: userId } });
    }
    const bridge = await tx.implementIdentityBridge.create({ data: { accessoryId: source.id, skuId: sku.id, openingLedgerId: opening.id,
      effectiveAt: input.effectiveAt, createdBy: userId, evidenceSnapshot: json({ schemaVersion: 2, before: plan.evidence,
        planFingerprint: plan.fingerprint, reviewedQuantity: input.quantity, nativeSku: sku, openingLedgerIds: [opening.id], opening }) } });
    return { status: 'PROMOTED' as const, bridge, replayed: false };
  }
}
