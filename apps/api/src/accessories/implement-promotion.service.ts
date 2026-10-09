import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveLatestSerializedMovements } from '../inventory/serialized-ledger-location';
import { serializedBalanceConsistency } from '../inventory/serialized-balance-consistency';
import { assertLegacyEquipmentOrigin } from '../documents/legacy-equipment-origin';
import { resolveCommercialMode } from '../commercial-profiles/commercial-resolver';
import type { CommercialGroup, CommercialMode, CommercialSnapshot } from '../commercial-profiles/commercial-profile.input';

export type ImplementPromotionInput = { accessoryId: string; skuId: string; effectiveAt: Date;
  parentLegacyOriginId?: string; assetDescription?: string; internalNumber?: number; sourceDocumentItemId?: string;
  unconfiguredPrice?: '0'; reviewedWarehouse?: { id: string; confirmation: string } };
type Balance = { quantity: number; warehouseId: string | null; assetId: string | null;
  customerWorksiteId: string | null; transitDocumentId: string | null };
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

export function promotionFingerprint(value: unknown) {
  const ordered = (v: any): any => Array.isArray(v) ? v.map(ordered)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(key => [key, ordered(v[key])])) : v;
  return createHash('sha256').update(JSON.stringify(ordered(json(value)))).digest('hex');
}

/** Quantities are custody, not a new receipt. A zero historical balance is retained. */
export function promotionBalance(balances: Balance[]) {
  const positive = balances.filter(row => row.quantity > 0);
  if (balances.some(row => !Number.isSafeInteger(row.quantity) || row.quantity < 0) ||
    positive.length !== 1 || positive[0].quantity !== 1 ||
    balances.reduce((sum, row) => sum + row.quantity, 0) !== 1)
    throw new BadRequestException('La promoción requiere exactamente una unidad y una ubicación inequívoca.');
  const row = positive[0];
  if (row.transitDocumentId || Boolean(row.warehouseId) === Boolean(row.assetId) ||
    (row.customerWorksiteId && !row.assetId))
    throw new BadRequestException('La unidad no puede estar en tránsito ni tener una ubicación ambigua.');
  return row;
}

export function replacePromotedSelector(payload: Prisma.JsonValue, accessoryId: string, assetId: string) {
  const copy = json(payload) as any;
  if (Array.isArray(copy?.groups)) for (const group of copy.groups) {
    if (!Array.isArray(group?.selectors)) continue;
    group.selectors = group.selectors.map((selector: any) => selector.kind === 'ACCESSORY' && selector.id === accessoryId
      ? { ...selector, kind: 'ASSET', id: assetId } : selector);
  }
  return copy as Prisma.InputJsonValue;
}
const referencesSource = (payload: Prisma.JsonValue, id: string) =>
  promotionFingerprint(payload) !== promotionFingerprint(replacePromotedSelector(payload, id, '__PROMOTED_ASSET__'));
const dayOf = (effectiveAt: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota',
  year: 'numeric', month: '2-digit', day: '2-digit' }).format(effectiveAt);

/** Controlled promotion, not a normal inventory create or an automatic migration.
 * V1 deliberately refuses documentary custody and nested legacy implement graphs.
 */
@Injectable()
export class ImplementPromotionService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(input: ImplementPromotionInput, userId: string) {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return this.previewInTransaction(tx, input, userId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
  }

  async apply(input: ImplementPromotionInput, userId: string, expectedFingerprint: string) {
    try {
      // READ COMMITTED is intentional: after waiting for the source row lock,
      // reads must see a draft/movement committed before that lock was acquired.
      return await this.prisma.$transaction(tx => this.promoteInTransaction(tx, input, userId, expectedFingerprint),
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError &&
        (['P2034', 'P2002'].includes(error.code) || String(error.meta?.code) === '40P01'))
        throw new ConflictException('El inventario cambió durante la promoción. Revisa la vista previa y vuelve a intentarlo.');
      throw error;
    }
  }

  private validateInput(input: ImplementPromotionInput) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(input.accessoryId) || !uuid.test(input.skuId) ||
      (input.parentLegacyOriginId !== undefined && !uuid.test(input.parentLegacyOriginId)) ||
      (input.sourceDocumentItemId !== undefined && !uuid.test(input.sourceDocumentItemId)) ||
      (input.unconfiguredPrice !== undefined && input.unconfiguredPrice !== '0') ||
      (input.reviewedWarehouse !== undefined && (!uuid.test(input.reviewedWarehouse.id) ||
        typeof input.reviewedWarehouse.confirmation !== 'string' || input.reviewedWarehouse.confirmation.trim().length < 10 ||
        input.reviewedWarehouse.confirmation.length > 500)) ||
      (input.internalNumber !== undefined && (!Number.isSafeInteger(input.internalNumber) ||
        input.internalNumber < 1 || input.internalNumber >= 2147483647)) ||
      (input.assetDescription !== undefined && (typeof input.assetDescription !== 'string' ||
        !input.assetDescription.trim() || input.assetDescription.length > 500)) ||
      !(input.effectiveAt instanceof Date) || !Number.isFinite(input.effectiveAt.getTime()))
      throw new BadRequestException('Indica las identidades exactas y una fecha válida para el empalme.');
  }

  private async readPlan(tx: Prisma.TransactionClient, input: ImplementPromotionInput, userId: string) {
    this.validateInput(input);
    const actor = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true, active: true } });
    if (!actor?.active || !['ADMIN', 'OFFICE'].includes(actor.role))
      throw new BadRequestException('La promoción debe ser revisada por Office o Admin activo.');
    const existing = await tx.implementIdentityBridge.findUnique({ where: { accessoryId: input.accessoryId },
      include: { asset: true, openingLedger: true } });
    if (existing) {
      if (!existing.asset) throw new ConflictException('Esta identidad ya fue convertida a inventario por cantidad.');
      if (existing.asset.skuId !== input.skuId || existing.effectiveAt.getTime() !== input.effectiveAt.getTime())
        throw new ConflictException('Esta unidad ya fue promovida con una referencia o fecha distinta.');
      const previous = existing.evidenceSnapshot as any;
      if ((previous.parentLegacyOriginId ?? null) !== (input.parentLegacyOriginId ?? null) ||
        (previous.before?.input?.sourceDocumentItemId ?? null) !== (input.sourceDocumentItemId ?? null) ||
        (previous.before?.input?.unconfiguredPrice ?? null) !== (input.unconfiguredPrice ?? null) ||
        (previous.before?.input?.internalNumber ?? null) !== (input.internalNumber ?? null) ||
        (previous.before?.input?.assetDescription ?? null) !== (input.assetDescription ?? null) ||
        promotionFingerprint(previous.before?.input?.reviewedWarehouse ?? null) !== promotionFingerprint(input.reviewedWarehouse ?? null))
        throw new ConflictException('Esta unidad ya fue promovida con una descripción o padre revisado diferente.');
      return { status: 'PROMOTED' as const, bridge: { ...existing, asset: existing.asset } };
    }
    const source = await tx.accessory.findUnique({ where: { id: input.accessoryId }, include: {
      balances: { orderBy: { id: 'asc' } }, movements: { orderBy: { id: 'asc' } },
      revisions: { orderBy: { id: 'asc' } }, assets: { orderBy: { assetId: 'asc' } },
      subfamilies: { orderBy: { subfamilyId: 'asc' } },
      compatibleParents: { orderBy: { parentAccessoryId: 'asc' } },
      compatibleChildren: { orderBy: { accessoryId: 'asc' } },
      configuration: { include: { entries: true } },
    } });
    if (!source) throw new NotFoundException('No se encontró el implemento anterior.');
    if (source.kind !== 'INDIVIDUAL' || !source.active)
      throw new BadRequestException('Solo se promueve una unidad individualizada activa. No se individualizan cantidades por inferencia.');
    const documentCount = await tx.documentItem.count({ where: { accessoryId: source.id } });
    const receiptCount = await tx.accessoryProviderReceiptItem.count({ where: { sourceMovement: { accessoryId: source.id } } });
    if (receiptCount || ((documentCount || source.movements.some(row => row.documentId)) && !input.sourceDocumentItemId))
      throw new BadRequestException('Este implemento tiene documentos o recepciones vinculados. Requiere un empalme documental específico; esta versión no los reescribe.');
    if (source.exclusiveAssetId || source.scope === 'ACCESSORIES' || source.compatibleParents.length ||
      source.compatibleChildren.length || source.configuration)
      throw new BadRequestException('Este implemento tiene pertenencia exclusiva o relaciones anidadas. Revisa esas relaciones antes de su promoción.');
    const balance = promotionBalance(source.balances);
    let documentarySource: any = null;
    if (input.sourceDocumentItemId) {
      const lines = await tx.documentItem.findMany({ where: { accessoryId: source.id }, include: {
        document: true, compositionParent: true,
        derivedDocumentItems: { where: { document: { status: 'CONFIRMED', type: 'RETURN' } } },
      } });
      const line = lines.find(row => row.id === input.sourceDocumentItemId);
      const assignment = source.movements.find(row => row.requestId === `document:${line?.documentId}:item:${line?.id}`);
      if (lines.length !== 1 || !line || line.document.type !== 'REMISSION' || line.document.status !== 'CONFIRMED' ||
        line.document.docDate > input.effectiveAt || Number(line.quantity ?? 1) !== 1 ||
        line.derivedDocumentItems.length || !balance.customerWorksiteId ||
        line.document.customerWorksiteId !== balance.customerWorksiteId || line.componentParentAssetId !== balance.assetId ||
        !assignment || assignment.type !== 'ASSIGN' || assignment.quantity !== 1 || assignment.documentId !== line.documentId ||
        source.movements.some(row => row.documentId && row.documentId !== line.documentId))
        throw new BadRequestException('La línea revisada no acredita una única entrega pendiente en la misma obra y equipo custodio.');
      const to = assignment.to as any;
      if (to?.assetId !== balance.assetId || to?.customerWorksiteId !== balance.customerWorksiteId)
        throw new BadRequestException('El movimiento documental no coincide con la custodia física revisada.');
      documentarySource = line;
    }
    if (input.effectiveAt.getTime() < Math.max(source.createdAt.getTime(), ...source.movements.map(row => row.createdAt.getTime())))
      throw new BadRequestException('La fecha de empalme no puede preceder la evidencia del inventario anterior.');
    const sku = await tx.sku.findUnique({ where: { id: input.skuId }, include: { assetFamily: true, assetSubfamily: true } });
    if (!sku?.active || sku.assetFamily.controlType !== 'SERIAL' || !sku.assetSubfamily?.active ||
      sku.assetSubfamily.assetFamilyId !== sku.assetFamilyId || sku.isConsumable)
      throw new BadRequestException('Selecciona una referencia SERIAL activa con subfamilia explícita para la unidad nueva.');
    // Sharing a SERIAL family does not imply compatibility or shared pricing.
    // The reviewed SKU/subfamily and concrete links identify this implement.
    if (input.internalNumber !== undefined && await tx.asset.findFirst({ where: {
      warehouseOwnerId: source.ownerWarehouseId, internalNumber: input.internalNumber,
      sku: { assetSubfamilyId: sku.assetSubfamilyId },
    }, select: { id: true } }))
      throw new BadRequestException('El número interno revisado ya pertenece a otra unidad de este propietario y subfamilia.');
    const owner = await tx.warehouse.findUnique({ where: { id: source.ownerWarehouseId }, select: { id: true, name: true } });
    if (!owner) throw new BadRequestException('El propietario del implemento no existe.');
    let warehouseId = balance.warehouseId;
    let custodian: any = null;
    if (balance.assetId && !input.reviewedWarehouse) {
      custodian = await tx.asset.findUnique({ where: { id: balance.assetId }, include: { ledger: { orderBy: { id: 'asc' } } } });
      if (!custodian?.active || custodian.deletedAt)
        throw new BadRequestException('El equipo custodio no está activo. Revisa la ubicación antes de convertir.');
      const location = resolveLatestSerializedMovements(custodian.ledger).get(custodian.id)?.locationMovement;
      if (!location || !serializedBalanceConsistency(custodian.ledger, custodian.warehouseOwnerId, location).isConsistent)
        throw new BadRequestException('La ubicación del equipo custodio no es consistente con su inventario.');
      if (balance.customerWorksiteId) {
        if (location.customerWorksiteId !== balance.customerWorksiteId || !['OUT', 'ON_SITE'].includes(location.movementType))
          throw new BadRequestException('El implemento y su equipo custodio no están en la misma obra.');
      } else {
        if (!location.warehouseId || !['IN', 'ADJUST'].includes(location.movementType))
          throw new BadRequestException('No se puede resolver la bodega del implemento asignado.');
        warehouseId = location.warehouseId;
      }
    }
    if (input.reviewedWarehouse) {
      if (!documentarySource || input.parentLegacyOriginId)
        throw new BadRequestException('La confirmación de bodega requiere la línea documental anterior exacta, sin inventar un padre en obra.');
      const reviewed = await tx.warehouse.findUnique({ where: { id: input.reviewedWarehouse.id }, select: { id: true, active: true } });
      if (!reviewed?.active || reviewed.id !== source.ownerWarehouseId)
        throw new BadRequestException('Esta apertura revisada debe hacerse en la bodega activa de su propietario.');
      warehouseId = reviewed.id;
    }
    const configurations = await tx.equipmentConfiguration.findMany({ where: { entries: { some: { accessoryId: source.id } } },
      include: { entries: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' } });
    if (configurations.some(row => row.accessoryId))
      throw new BadRequestException('El implemento es parte de un conjunto legado anidado. Su padre debe revisarse explícitamente.');
    const compatibilityIds = source.assets.map(row => row.assetId)
      .filter(id => !configurations.some(configuration => configuration.assetId === id));
    const compatibilityConfigurations = compatibilityIds.length ? await tx.equipmentConfiguration.findMany({
      where: { assetId: { in: compatibilityIds } }, include: { entries: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' },
    }) : [];
    const parentLegacyOrigin = input.parentLegacyOriginId ? await assertLegacyEquipmentOrigin(
      tx, input.parentLegacyOriginId, balance.customerWorksiteId, input.effectiveAt, true,
    ) : null;
    if (parentLegacyOrigin && (!balance.assetId || !balance.customerWorksiteId ||
      parentLegacyOrigin.sourceLedger.assetId !== balance.assetId ||
      parentLegacyOrigin.sourceLedger.ownerWarehouseId !== source.ownerWarehouseId))
      throw new BadRequestException('El padre revisado no corresponde al custodio, propietario y obra originales de esta unidad.');
    const effectiveFrom = new Date(`${dayOf(input.effectiveAt)}T00:00:00Z`);
    const allProfiles = await tx.commercialProfile.findMany({ include: { revisions: {
      orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }] } }, orderBy: { id: 'asc' } });
    const ownProfile = allProfiles.find(row => row.scopeType === 'ACCESSORY' && row.scopeId === source.id);
    const activeRevision = (profile: typeof allProfiles[number]) =>
      profile.revisions.find(row => row.effectiveFrom.getTime() <= effectiveFrom.getTime());
    if (ownProfile?.revisions.some(row => row.effectiveFrom.getTime() > effectiveFrom.getTime()) ||
      allProfiles.some(profile => profile.revisions.some(row => row.effectiveFrom.getTime() > effectiveFrom.getTime() && referencesSource(row.payload, source.id))))
      throw new BadRequestException('Hay modalidades futuras para esta identidad. Revisa su empalme comercial antes de convertir.');
    const ownRevision = ownProfile ? activeRevision(ownProfile) : undefined;
    if (ownProfile && !ownRevision)
      throw new BadRequestException('El perfil del implemento no tiene una revisión vigente para el empalme.');
    const referencingProfiles = allProfiles.filter(profile => profile.id !== ownProfile?.id &&
      activeRevision(profile) && referencesSource(activeRevision(profile)!.payload, source.id));
    const commercial = { ownProfile: ownProfile ?? null, ownRevision: ownRevision ?? null,
      referencingProfiles: referencingProfiles.map(profile => ({ ...profile, selectedRevision: activeRevision(profile)! })) };
    const evidence = { input: { ...input, effectiveAt: input.effectiveAt.toISOString() }, actor, source, sku, owner,
      location: { warehouseId, customerWorksiteId: input.reviewedWarehouse ? null : balance.customerWorksiteId, custodianAssetId: input.reviewedWarehouse ? null : balance.assetId },
      reviewedWarehouse: input.reviewedWarehouse ?? null,
      parentLegacyOrigin, documentarySource,
      custodian: custodian ? { id: custodian.id, warehouseOwnerId: custodian.warehouseOwnerId, warehouseCurrentId: custodian.warehouseCurrentId,
        ledger: custodian.ledger } : null, configurations, compatibilityIds, compatibilityConfigurations,
      commercial, effectiveFrom: effectiveFrom.toISOString() };
    return { status: 'READY' as const, fingerprint: promotionFingerprint(evidence), evidence, source, sku, configurations,
      commercial, effectiveFrom, location: evidence.location };
  }

  previewInTransaction(tx: Prisma.TransactionClient, input: ImplementPromotionInput, userId: string) {
    return this.readPlan(tx, input, userId);
  }

  async promoteInTransaction(tx: Prisma.TransactionClient, input: ImplementPromotionInput, userId: string, expectedFingerprint: string) {
    this.validateInput(input);
    if (!/^[0-9a-f]{64}$/.test(expectedFingerprint))
      throw new BadRequestException('Revisa una vista previa vigente antes de aplicar la promoción.');
    // Source-first agrees with document/commercial/configuration FOR SHARE guards.
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Accessory" WHERE id=${input.accessoryId} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('No se encontró el implemento anterior.');
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('equipment-configuration',0))::text`;
    let plan = await this.readPlan(tx, input, userId);
    if (plan.status === 'PROMOTED') {
      const snapshot = plan.bridge.evidenceSnapshot as any;
      if (snapshot.planFingerprint !== expectedFingerprint)
        throw new ConflictException('La clave de revisión no corresponde a la promoción existente.');
      if ((snapshot.parentLegacyOriginId ?? null) !== (input.parentLegacyOriginId ?? null))
        throw new ConflictException('La promoción existente tiene un padre revisado diferente.');
      const openingLedgers = await tx.stockLedger.findMany({ where: { id: { in: snapshot.openingLedgerIds } }, orderBy: { appendOrder: 'asc' } });
      return { status: 'PROMOTED' as const, bridge: plan.bridge, asset: plan.bridge.asset, openingLedgers, replayed: true };
    }
    if (plan.location.custodianAssetId)
      await tx.$queryRaw`SELECT id FROM "Asset" WHERE id=${plan.location.custodianAssetId} FOR UPDATE`;
    const scopes = [{ scopeType: 'ACCESSORY', scopeId: plan.source.id }, ...plan.commercial.referencingProfiles]
      .map(row => `${row.scopeType}:${row.scopeId}`).sort();
    for (const scope of scopes)
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`commercial-profile:${scope}`},0))::text`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`implement-counter:${plan.source.ownerWarehouseId}:${plan.sku.assetSubfamilyId}`},0))::text`;
    plan = await this.readPlan(tx, input, userId);
    if (plan.status !== 'READY' || plan.fingerprint !== expectedFingerprint)
      throw new ConflictException('La identidad, ubicación o configuración cambió desde la revisión. No se promovió la unidad.');

    const counterKey = { ownerWarehouseId: plan.source.ownerWarehouseId, assetSubfamilyId: plan.sku.assetSubfamilyId! };
    // The same unique counter row used by native creation is advanced atomically.
    // GREATEST repairs a stale baseline without replacing a concurrent increment.
    const allocated = await tx.$queryRaw<Array<{ internalNumber: number }>>`
      INSERT INTO "AssetInternalCounter" (id,"ownerWarehouseId","assetSubfamilyId","nextNumber","createdAt","updatedAt")
      SELECT ${randomUUID()}, ${counterKey.ownerWarehouseId}, ${counterKey.assetSubfamilyId},
        COALESCE(MAX(a."internalNumber"),0)+2, now(), now()
      FROM "Asset" a JOIN "Sku" s ON s.id=a."skuId"
      WHERE a."warehouseOwnerId"=${counterKey.ownerWarehouseId} AND s."assetSubfamilyId"=${counterKey.assetSubfamilyId}
      ON CONFLICT ("ownerWarehouseId","assetSubfamilyId") DO UPDATE SET
        "nextNumber"=GREATEST("AssetInternalCounter"."nextNumber",EXCLUDED."nextNumber"-1)+1,
        "updatedAt"=now()
      RETURNING "nextNumber"-1 AS "internalNumber"`;
    const internalNumber = input.internalNumber ?? allocated[0]?.internalNumber;
    if (!Number.isSafeInteger(internalNumber) || internalNumber < 1 || internalNumber >= 2147483647)
      throw new BadRequestException('El contador interno de la subfamilia no es válido.');
    if (input.internalNumber !== undefined) {
      // The counter row is locked by the allocator above, including against
      // normal UI creation. A reviewed number never rewinds that counter.
      if (await tx.asset.findFirst({ where: { warehouseOwnerId: counterKey.ownerWarehouseId,
        internalNumber, sku: { assetSubfamilyId: counterKey.assetSubfamilyId } }, select: { id: true } }))
        throw new ConflictException('Otra unidad ocupa el número revisado. Se revierte el empalme.');
      await tx.assetInternalCounter.updateMany({ where: { ...counterKey, nextNumber: { lte: internalNumber } },
        data: { nextNumber: internalNumber + 1 } });
    }
    const asset = await tx.asset.create({ data: { skuId: plan.sku.id, isImplement: true, internalNumber,
      publicCode: `${plan.sku.assetFamily.code}-${plan.sku.assetSubfamily!.code}-${plan.source.ownerWarehouseId.slice(0, 4).toUpperCase()}-${String(internalNumber).padStart(4, '0')}`,
      description: input.assetDescription?.trim() ?? plan.source.name, warehouseOwnerId: plan.source.ownerWarehouseId,
      warehouseCurrentId: plan.location.customerWorksiteId ? null : plan.location.warehouseId } });
    // Native ON_SITE offsets a warehouse opening. Two accounting baselines,
    // not two physical units or invented documentary movements.
    const opening = await tx.stockLedger.create({ data: { assetId: asset.id, ownerWarehouseId: asset.warehouseOwnerId,
      warehouseId: plan.location.customerWorksiteId ? asset.warehouseOwnerId : plan.location.warehouseId,
      movementType: 'ADJUST', quantity: 1, isOpeningBalance: true, effectiveAt: input.effectiveAt, createdBy: userId } });
    const openingLedgers = [opening];
    if (plan.location.customerWorksiteId) openingLedgers.push(await tx.stockLedger.create({ data: {
      assetId: asset.id, ownerWarehouseId: asset.warehouseOwnerId, customerWorksiteId: plan.location.customerWorksiteId,
      movementType: 'ON_SITE', quantity: 1, isOpeningBalance: true, effectiveAt: input.effectiveAt, createdBy: userId } }));
    if (!serializedBalanceConsistency(openingLedgers, asset.warehouseOwnerId, openingLedgers.at(-1)).isConsistent)
      throw new ConflictException('La apertura no conserva una única unidad en la ubicación original. Se revierte el empalme.');

    for (const configuration of plan.configurations) {
      await tx.equipmentConfigurationEntry.updateMany({ where: { configurationId: configuration.id, accessoryId: plan.source.id },
        data: { accessoryId: null, assetId: asset.id, required: false, maximumQuantity: null, recommendation: true } });
      const saved = await tx.equipmentConfiguration.update({ where: { id: configuration.id }, data: { version: { increment: 1 } },
        include: { entries: { orderBy: { id: 'asc' } } } });
      await tx.equipmentConfigurationRevision.create({ data: { configurationId: configuration.id,
        before: json(configuration), after: json(saved), createdBy: userId } });
    }
    // AccessoryAsset is already an explicit unit link, not a FAMILY inference.
    // Preserve it in the new configuration even if the old UI never added an entry.
    for (const parentId of plan.evidence.compatibilityIds) {
      const previous = plan.evidence.compatibilityConfigurations.find(row => row.assetId === parentId);
      const configuration = previous ?? await tx.equipmentConfiguration.create({ data: { assetId: parentId } });
      await tx.equipmentConfigurationEntry.create({ data: { configurationId: configuration.id,
        assetId: asset.id, role: 'ACCESSORY', quantity: 1, defaultIncluded: false, required: false,
        recommendation: true, sortOrder: previous?.entries.length ?? 0 } });
      const saved = await tx.equipmentConfiguration.update({ where: { id: configuration.id }, data: { version: { increment: 1 } },
        include: { entries: { orderBy: { id: 'asc' } } } });
      await tx.equipmentConfigurationRevision.create({ data: { configurationId: saved.id,
        before: previous ? json(previous) : { entries: [] }, after: json(saved), createdBy: userId } });
    }
    const commercialRevisions: any[] = [];
    let promotedProfile: { id: string; version: number; effectiveFrom: string; groups: CommercialGroup[]; modes: CommercialMode[] } | null = null;
    if (plan.commercial.ownRevision || input.unconfiguredPrice === '0') {
      const profile = await tx.commercialProfile.create({ data: { scopeType: 'ASSET', scopeId: asset.id, version: 1 } });
      const payload = (plan.commercial.ownRevision
        ? replacePromotedSelector(plan.commercial.ownRevision.payload, plan.source.id, asset.id)
        : { groups: [], modes: [{ id: randomUUID(), name: 'Tarifa', unit: plan.sku.chargeType,
          minimum: { value: '0', basis: 'PER_RENTAL' }, pricing: { source: 'FIXED', amount: '0' }, conditions: [], parts: [] }] }
      ) as unknown as { groups: CommercialGroup[]; modes: CommercialMode[] };
      commercialRevisions.push(await tx.commercialProfileRevision.create({ data: { profileId: profile.id, version: 1,
        effectiveFrom: plan.effectiveFrom, payload: payload as unknown as Prisma.InputJsonValue, createdBy: userId } }));
      promotedProfile = { id: profile.id, version: 1, effectiveFrom: plan.effectiveFrom.toISOString().slice(0, 10), ...payload };
    }
    for (const profile of plan.commercial.referencingProfiles) {
      const updated = await tx.commercialProfile.update({ where: { id: profile.id }, data: { version: { increment: 1 } } });
      commercialRevisions.push(await tx.commercialProfileRevision.create({ data: { profileId: profile.id, version: updated.version,
        effectiveFrom: plan.effectiveFrom, payload: replacePromotedSelector(profile.selectedRevision.payload, plan.source.id, asset.id), createdBy: userId } }));
    }
    const catalog = { unit: plan.sku.chargeType, price: plan.sku.price?.toFixed(2) ?? null };
    const frozenCommercialSnapshot: CommercialSnapshot = { ...(promotedProfile
      ? resolveCommercialMode(promotedProfile, [], catalog)
      : { status: 'REVIEW' as const, reason: 'El implemento promovido no tiene modalidad comercial revisada. No se asume tarifa cero.', parts: [] }),
      schemaVersion: 2, catalog, ...(promotedProfile ? { frozenProfile: promotedProfile } : {}) };
    const bridge = await tx.implementIdentityBridge.create({ data: { accessoryId: plan.source.id, assetId: asset.id,
      openingLedgerId: openingLedgers.at(-1)!.id, effectiveAt: input.effectiveAt, createdBy: userId,
      evidenceSnapshot: json({ schemaVersion: 1, planFingerprint: plan.fingerprint, before: plan.evidence,
        documentarySource: plan.evidence.documentarySource,
        parentLegacyOriginId: input.parentLegacyOriginId ?? null,
        reviewedCustody: { parentAssetId: plan.location.custodianAssetId, customerWorksiteId: plan.location.customerWorksiteId,
          warehouseId: plan.location.warehouseId, ownerWarehouseId: asset.warehouseOwnerId }, frozenCommercialSnapshot,
        openingLedgerIds: openingLedgers.map(row => row.id), openingLedgers,
        commercialRevisionIds: commercialRevisions.map(row => row.id), asset }) } });
    return { status: 'PROMOTED' as const, bridge, asset, openingLedgers, replayed: false };
  }
}
