import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertAcyclicConfiguration } from './equipment-configuration-rules';
import { CompositionFields, validateDocumentComposition } from '../documents/document-composition';
import { validateDeliveryFuel } from '../documents/document-delivery-fuel';

type Line = CompositionFields & { assetId?: string | null; skuId?: string | null; accessoryId?: string | null;
  componentParentAssetId?: string | null; quantity?: unknown };
type Document = { id?: string; docDate?: Date; type: string; customerWorksiteId?: string | null; items: Line[] };

/** The only composition validator. Stock/ownership is validated by the existing movement transaction. */
export async function validateDocumentConfiguration(tx: Prisma.TransactionClient, document: Document) {
  await validateDeliveryFuel(tx, document);
  const composition = document.id && document.docDate ? await validateDocumentComposition(tx, {
    ...document, id: document.id, docDate: document.docDate, customerWorksiteId: document.customerWorksiteId ?? null,
  }) : null;
  const assetIds = document.items.flatMap(item => item.assetId ? [item.assetId] : []);
  if (!assetIds.length && !composition) return; // Legacy independent supplies retain custody validation.
  const uniqueIds = [...new Set(assetIds)];
  if (assetIds.length !== uniqueIds.length) throw new BadRequestException('Un equipo no puede aparecer dos veces en el documento.');
  if (document.type === 'RETURN' && (composition || !document.items.some(item => item.componentParentAssetId && !item.accessoryId))) return;
  // Hold the assignment stable until the movement transaction commits.
  // Inventory edits use the exclusive version of the same advisory lock.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended('equipment-configuration', 0))::text`;
  const parentIds = new Set(uniqueIds);
  const loadedAssetIds = [...new Set([...uniqueIds, ...(composition ? [...composition.parents.values()].flatMap(parent => parent.assetId ? [parent.assetId] : []) : [])])];
  const accessoryParentIds = composition ? [...new Set([...composition.parents.values()].flatMap(parent => parent.accessoryId ? [parent.accessoryId] : []))] : [];
  const [configs, assets, skus] = await Promise.all([
    tx.equipmentConfiguration.findMany({ where: accessoryParentIds.length ? { OR: [{ assetId: { in: loadedAssetIds } }, { accessoryId: { in: accessoryParentIds } }] } : { assetId: { in: loadedAssetIds } }, include: { entries: {
      include: { asset: { select: { description: true, internalNumber: true, sku: { select: { name: true } } } }, accessory: { select: { name: true } }, family: { select: { name: true } } },
    } } }),
    tx.asset.findMany({ where: { id: { in: loadedAssetIds } }, select: { id: true,
      publicCode: true, internalNumber: true, sku: { select: { assetFamilyId: true, name: true } } } }),
    tx.sku.findMany({ where: { id: { in: document.items.flatMap(item => item.skuId ? [item.skuId] : []) } }, select: { id: true, assetFamilyId: true } }),
  ]);
  const byAsset = new Map(assets.map(asset => [asset.id, asset]));
  const skuFamilies = new Map(skus.map(sku => [sku.id, sku.assetFamilyId]));
  const byParent = new Map(configs.map(config => [config.assetId, config.entries]));
  type Entry = (typeof configs)[number]['entries'][number];
  const matches = (entry: Entry, item: Line) => Boolean(
    (entry.assetId && entry.assetId === item.assetId) ||
    (entry.skuId && entry.skuId === item.skuId) ||
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
  if (composition) {
    const configsByOwner = new Map(configs.map(config => [config.assetId ? `asset:${config.assetId}` : `accessory:${config.accessoryId}`, config.entries]));
    for (const item of composition.items) {
      const parent = composition.parents.get(item.compositionNodeId!);
      if (!parent || item.accessoryId) continue; // Accessory compatibility also checks its immediate parent at movement time.
      const allowed = (configsByOwner.get(parent.assetId ? `asset:${parent.assetId}` : `accessory:${parent.accessoryId}`) ?? []).some(entry => matches(entry, item));
      if (!allowed) throw new BadRequestException('La pieza no está permitida en la configuración de su padre inmediato.');
    }
    // Implement quantities are recommendations, including untouched legacy
    // configurations. Stock, ownership and documentary origin stay enforced
    // by their own validators; old minimums/caps never block a new document.
    return;
  }
  for (const item of document.items.filter(item => item.componentParentAssetId && !item.accessoryId)) {
    const parentId = item.componentParentAssetId!;
    if (!parentIds.has(parentId)) throw new BadRequestException('El equipo principal de una pieza debe estar incluido en el documento.');
    const configured = (byParent.get(parentId) ?? []).some(entry => matches(entry, item));
    const previouslySent = history.some(old => old.componentParentAssetId === parentId &&
      (item.assetId ? old.assetId === item.assetId : old.skuId === item.skuId));
    if (!configured && !previouslySent) throw new BadRequestException('La pieza no está permitida en la configuración del equipo. Revisa su tuerca de configuración.');
  }
}
