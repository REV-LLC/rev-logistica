import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertAcyclicConfiguration } from './equipment-configuration-rules';

type Line = { assetId?: string | null; skuId?: string | null; accessoryId?: string | null;
  componentParentAssetId?: string | null; quantity?: unknown };
type Document = { type: string; customerWorksiteId?: string | null; items: Line[] };

/** The only composition validator. Stock/ownership is validated by the existing movement transaction. */
export async function validateDocumentConfiguration(tx: Prisma.TransactionClient, document: Document) {
  const assetIds = document.items.flatMap(item => item.assetId ? [item.assetId] : []);
  if (!assetIds.length) return; // Independent accessory returns/supplies retain their custody validation.
  const uniqueIds = [...new Set(assetIds)];
  if (assetIds.length !== uniqueIds.length) throw new BadRequestException('Un equipo no puede aparecer dos veces en el documento.');
  if (document.type === 'RETURN' && !document.items.some(item => item.componentParentAssetId && !item.accessoryId)) return;
  // Hold the assignment stable until the movement transaction commits.
  // Inventory edits use the exclusive version of the same advisory lock.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended('equipment-configuration', 0))::text`;
  const parentIds = new Set(uniqueIds);
  const [configs, assets, skus] = await Promise.all([
    tx.equipmentConfiguration.findMany({ where: { assetId: { in: uniqueIds } }, include: { entries: {
      include: { asset: { select: { publicCode: true } }, accessory: { select: { name: true } }, family: { select: { name: true } } },
    } } }),
    tx.asset.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, kind: true, motorConfiguration: true, assignedMotorId: true,
      publicCode: true, internalNumber: true, sku: { select: { assetFamilyId: true, name: true } } } }),
    tx.sku.findMany({ where: { id: { in: document.items.flatMap(item => item.skuId ? [item.skuId] : []) } }, select: { id: true, assetFamilyId: true } }),
  ]);
  const byAsset = new Map(assets.map(asset => [asset.id, asset]));
  const skuFamilies = new Map(skus.map(sku => [sku.id, sku.assetFamilyId]));
  const byParent = new Map(configs.map(config => [config.assetId, config.entries]));
  type Entry = (typeof configs)[number]['entries'][number];
  const matches = (entry: Entry, item: Line) => Boolean(
    (entry.assetId && entry.assetId === item.assetId) ||
    (entry.accessoryId && entry.accessoryId === item.accessoryId) ||
    (entry.familyId && entry.familyId === (item.assetId ? byAsset.get(item.assetId)?.sku.assetFamilyId : skuFamilies.get(item.skuId ?? ''))),
  );
  const edges = document.items.filter(item => item.assetId && item.componentParentAssetId)
    .map(item => [item.componentParentAssetId!, item.assetId!] as [string, string]);
  for (const id of uniqueIds) assertAcyclicConfiguration(id, edges);
  const history = document.type === 'RETURN' && document.customerWorksiteId ? await tx.documentItem.findMany({
    where: { componentParentAssetId: { in: uniqueIds }, document: { type: 'REMISSION', status: 'CONFIRMED', customerWorksiteId: document.customerWorksiteId } },
    select: { assetId: true, skuId: true, componentParentAssetId: true },
  }) : [];
  if (document.type === 'REMISSION') {
    for (const asset of assets.filter(asset => asset.kind !== 'MOTOR' && asset.motorConfiguration === 'INTERCHANGEABLE' && parentIds.has(asset.id))) {
      if (!asset.assignedMotorId) throw new BadRequestException({ code: 'MOTOR_ASSIGNMENT_REQUIRED',
        message: `${asset.sku.name ?? 'El equipo'} #${asset.internalNumber ?? ''} no tiene motor asignado. Office debe asignarlo en inventario antes de la remisión.` });
      if (!document.items.some(item => item.assetId === asset.assignedMotorId && item.componentParentAssetId === asset.id))
        throw new BadRequestException('La remisión debe incluir el motor asignado al equipo en inventario. Actualiza la configuración del documento; el motor no se cambia aquí.');
    }
  }
  for (const item of document.items.filter(item => item.componentParentAssetId && !item.accessoryId)) {
    const parentId = item.componentParentAssetId!;
    if (!parentIds.has(parentId)) throw new BadRequestException('El equipo principal de una pieza debe estar incluido en el documento.');
    const parent = byAsset.get(parentId);
    const isMotor = item.assetId && byAsset.get(item.assetId)?.kind === 'MOTOR';
    const assignedMotor = isMotor && parent?.motorConfiguration === 'INTERCHANGEABLE' && parent.assignedMotorId === item.assetId;
    const configured = isMotor ? assignedMotor : (byParent.get(parentId) ?? []).some(entry => matches(entry, item));
    const previouslySent = history.some(old => old.componentParentAssetId === parentId &&
      (item.assetId ? old.assetId === item.assetId : old.skuId === item.skuId));
    if (!configured && !previouslySent) throw new BadRequestException('La pieza no está permitida en la configuración del equipo. Revisa su tuerca de configuración.');
  }
  if (document.type !== 'REMISSION') return; // Never demand today's default parts on a partial return.
  for (const [parentId, entries] of byParent) {
    const selected = document.items.filter(item => item.componentParentAssetId === parentId);
    for (const entry of entries) {
      const quantity = selected.filter(item => matches(entry, item)).reduce((sum, item) => sum + (item.assetId ? 1 : Number(item.quantity ?? 1)), 0);
      const label = entry.family?.name ?? entry.accessory?.name ?? entry.asset?.publicCode ?? 'la pieza configurada';
      const parent = byAsset.get(parentId!);
      const parentLabel = parent?.sku.name?.trim() ? `${parent.sku.name}${parent.internalNumber ? ` #${parent.internalNumber}` : ''}` : 'El equipo seleccionado';
      if (entry.required && quantity < entry.quantity) throw new BadRequestException({
        code: 'MISSING_EQUIPMENT_PART', message: `${parentLabel} requiere ${entry.quantity} de ${label}. Edita el documento y revisa su configuración.`,
      });
      if (entry.maximumQuantity != null && quantity > entry.maximumQuantity)
        throw new BadRequestException(`La configuración permite como máximo ${entry.maximumQuantity} de ${label}.`);
    }
  }
}
