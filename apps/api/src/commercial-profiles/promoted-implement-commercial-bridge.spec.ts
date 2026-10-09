import { Prisma } from '@prisma/client';
import { promotedImplementCommercialBridge, promotedImplementProjectionEvidence, isReviewedImplementCutover,
  projectReviewedImplementCutovers } from './promoted-implement-commercial-bridge';
import { commercialNodesAt } from './commercial-history-v2';
import { resolveComposition } from './commercial-composition';
import { prepareCommercialV2 } from '../annexes/annex-commercial-v2-source';
import { annexInputSchema } from '../annexes/annex-input';
import { applyCommercialComposition } from '../annexes/annex-commercial-source';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const zeroMode = { id: uuid(20), name: 'Modalidad genérica', unit: 'DAY', minimum: { value: '0', basis: 'PER_RENTAL' },
  pricing: { source: 'FIXED', amount: '0' }, conditions: [], parts: [] };
const frozen = { schemaVersion: 2, status: 'RESOLVED', parts: [], catalog: { unit: 'DAY', price: '0.00' },
  frozenProfile: { id: uuid(21), version: 1, effectiveFrom: '2026-10-06', groups: [], modes: [zeroMode] } };
function fixture() {
  const opening = { id: 'opening', assetId: uuid(1), ownerWarehouseId: 'owner', customerWorksiteId: 'site',
    movementType: 'ON_SITE', quantity: new Prisma.Decimal(1), refDocumentId: null, isOpeningBalance: true,
    reversedByDocumentId: null, effectiveAt: new Date('2026-10-06T15:00:00Z'),
    asset: { id: uuid(1), warehouseOwnerId: 'owner', sku: { id: uuid(3), name: 'Equipo Y', assetFamilyId: uuid(4), price: new Prisma.Decimal(999) } } };
  const bridge = { id: 'reviewed-promotion', assetId: uuid(1), accessoryId: uuid(2), openingLedgerId: 'opening',
    effectiveAt: opening.effectiveAt, openingLedger: opening, evidenceSnapshot: { schemaVersion: 1, asset: { id: uuid(1) },
      before: { source: { id: uuid(2) } },
      openingLedgerIds: ['opening'], frozenCommercialSnapshot: JSON.parse(JSON.stringify(frozen)),
      reviewedCustody: { parentAssetId: uuid(5), customerWorksiteId: 'site', ownerWarehouseId: 'owner' }, parentLegacyOriginId: 'reviewed-parent' } };
  const parent = { id: 'reviewed-parent', assetId: uuid(5), ownerWarehouseId: 'owner', customerWorksiteId: 'site', effectiveFrom: new Date('2026-10-01T05:00:00Z') };
  const parentSnapshot = { schemaVersion: 2, status: 'RESOLVED', parts: [], catalog: { unit: 'DAY', price: '100' },
    frozenProfile: { id: uuid(22), version: 1, effectiveFrom: '2026-10-01',
      groups: [{ id: uuid(23), name: 'Implemento revisado', selectors: [{ kind: 'ACCESSORY', id: uuid(2) }] }],
      modes: [{ ...zeroMode, id: uuid(24), pricing: { source: 'FIXED', amount: '100' }, parts: [{ groupId: uuid(23), treatment: 'INCLUDED' }] }] } };
  const parentDocument = { id: 'legacy-origin:reviewed-parent', type: 'REMISSION', docDate: parent.effectiveFrom,
    items: [{ id: 'legacy-origin:reviewed-parent', assetId: uuid(5), asset: { sku: { id: uuid(25), name: 'Equipo X', assetFamilyId: uuid(26) } },
      quantity: new Prisma.Decimal(1), commercialSnapshot: parentSnapshot }] };
  const tx = { implementIdentityBridge: { findMany: jest.fn().mockResolvedValue([bridge]) }, stockLedger: { findMany: jest.fn().mockResolvedValue([]) } };
  return { tx, bridge, opening, parent, parentSnapshot, parentDocument,
    project: () => promotedImplementCommercialBridge(tx as never, 'site', '2026-10-10', [parent]) };
}

describe('reviewed implement opening commercial projection', () => {
  it('accepts an explicit append-only review of the existing parent origin without changing the bridge', async () => {
    const f = fixture();
    delete (f.bridge.evidenceSnapshot as any).parentLegacyOriginId;
    const original = JSON.stringify(f.bridge.evidenceSnapshot);
    (f.bridge as any).commercialOriginReview = { parentOriginId: f.parent.id, evidenceSnapshot: {
      schemaVersion: 1, bridgeId: f.bridge.id, parentOriginId: f.parent.id,
      assetId: f.parent.assetId, ownerWarehouseId: 'owner', customerWorksiteId: 'site',
      confirmation: 'Se verificó el origen exacto ya revisado del equipo principal.',
    } };
    const projected = await f.project();
    expect(projected.documents[0].items[0].parentLegacyOriginId).toBe(f.parent.id);
    expect(projected.documents[0].items[0].commercialSnapshot?.status).toBe('RESOLVED');
    expect(JSON.stringify(f.bridge.evidenceSnapshot)).toBe(original);
    (f.bridge as any).commercialOriginReview.evidenceSnapshot.assetId = uuid(999);
    expect((await f.project()).documents[0].items[0].commercialSnapshot?.status).toBe('REVIEW');
  });
  it('ends only the reviewed old commercial line on D-1 and starts the native identity on D', async () => {
    const f = fixture();
    const original = { id: 'old-line', accessoryId: uuid(2), assetId: null, skuId: null,
      componentParentAssetId: uuid(5), quantity: new Prisma.Decimal(1), commercialSnapshot: frozen,
      parentLegacyOriginId: 'reviewed-parent' };
    (f.bridge.evidenceSnapshot as any).documentarySource = { ...original,
      document: { id: 'old-doc', type: 'REMISSION', status: 'CONFIRMED', customerWorksiteId: 'site' } };
    const originalDoc = { id: 'old-doc', type: 'REMISSION', docDate: new Date('2026-10-02T15:00:00Z'), items: [original] };
    const before = JSON.stringify(originalDoc);
    const projected = await f.project();
    const closure = projected.documents.find(doc => doc.id.endsWith(':legacy-closure'))!;
    expect(closure.docDate.toISOString().slice(0, 10)).toBe('2026-10-05');
    expect(isReviewedImplementCutover(closure.items[0])).toBe(true);
    expect(isReviewedImplementCutover({ ...closure.items[0] })).toBe(false);
    const docs = [originalDoc, f.parentDocument, ...projected.documents] as any;
    expect(commercialNodesAt(docs, '2026-10-05').some(node => node.id === original.id)).toBe(true);
    expect(commercialNodesAt(docs, '2026-10-06').some(node => node.id === original.id)).toBe(false);
    expect(commercialNodesAt(docs, '2026-10-06').filter(node => node.assetId === uuid(1))).toHaveLength(1);
    expect(JSON.stringify(originalDoc)).toBe(before);
    expect(projectReviewedImplementCutovers([originalDoc] as any, projected.documents)[0]).toBe(originalDoc);
  });

  it('requires minimum/report continuity review instead of starting another rental minimum', async () => {
    const f = fixture();
    (f.bridge.evidenceSnapshot as any).documentarySource = { id: 'old-line', accessoryId: uuid(2),
      document: { type: 'REMISSION', status: 'CONFIRMED', customerWorksiteId: 'site' },
      commercialSnapshot: { ...frozen, frozenProfile: { ...frozen.frozenProfile,
        modes: [{ ...zeroMode, minimum: { value: '3', basis: 'PER_RENTAL' } }] } } };
    const projected = await f.project();
    expect(projected.documents[0].items[0].commercialSnapshot).toMatchObject({ status: 'REVIEW', minimumReview: true });
    expect(resolveComposition(commercialNodesAt([f.parentDocument, ...projected.documents] as any, '2026-10-06'))
      .get('implement-origin:reviewed-promotion')?.status).toBe('REVIEW');
  });

  it('never creates an empty legacy tranche before a newly promoted opening within the fortnight', async () => {
    const f = fixture();
    const tx = { ...f.tx, document: { findMany: jest.fn().mockResolvedValue([]) },
      accessoryMovement: { findMany: jest.fn().mockResolvedValue([]) }, legacyEquipmentOrigin: { findMany: jest.fn().mockResolvedValue([]) } };
    const lot = { id: 'opening', skuId: uuid(3), assetId: uuid(1), label: 'Equipo Y', deliveredOn: '2026-10-06', quantity: '1',
      source: { reference: 'opening', origin: 'INVENTORY' as const }, returns: [], pricing: { basePrice: '0' }, waivedDays: [] };
    const result = await applyCommercialComposition(tx as never, [lot], [f.opening as never],
      { from: '2026-10-01', to: '2026-10-15', through: '2026-10-10' }, 'site', []);
    expect(result.rentals).toHaveLength(1);
    expect(result.rentals[0].commercialInterval).toMatchObject({ from: '2026-10-06', to: '2026-10-10' });
    expect(result.rentals[0].commercial?.status).toBe('REVIEW'); // No approved parent in this fixture.
  });
  it('projects only the reviewed same-unit identity, keeps the old frozen parent unchanged, and bills one zero row', async () => {
    const f = fixture();
    const evidenceBefore = JSON.stringify(f.bridge.evidenceSnapshot), parentBefore = JSON.stringify(f.parentSnapshot);
    const projected = await f.project();
    expect(projected.entries).toEqual([{ sourceLedgerId: 'opening', nodeId: 'implement-origin:reviewed-promotion', effectiveFrom: '2026-10-06' }]);
    const docs = [f.parentDocument, ...projected.documents] as any;
    expect(commercialNodesAt(docs, '2026-10-05').some(node => node.assetId === uuid(1))).toBe(false);
    const snapshots = resolveComposition(commercialNodesAt(docs, '2026-10-06'));
    expect(snapshots.get('implement-origin:reviewed-promotion')).toMatchObject({ status: 'RESOLVED', contextualZero: true, basePrice: '0.00' });
    expect(snapshots.get('legacy-origin:reviewed-parent')?.basePrice).toBe('100');
    expect(JSON.stringify([...snapshots.values()])).not.toContain('legacyAccessoryId');
    expect(JSON.stringify(f.parentSnapshot)).toBe(parentBefore);
    expect(JSON.stringify(f.bridge.evidenceSnapshot)).toBe(evidenceBefore);
    expect(projected.documents[0].items[0].accessoryId).toBeNull();
    const lot = { id: 'opening', skuId: uuid(3), assetId: uuid(1), label: 'Equipo Y', deliveredOn: '2026-10-06', quantity: '1',
      source: { reference: 'opening', origin: 'INVENTORY' as const }, returns: [], pricing: { basePrice: '999' }, waivedDays: [] };
    const prepared = prepareCommercialV2(docs, [{ lot, itemId: projected.entries[0].nodeId }], [],
      { from: '2026-10-01', to: '2026-10-15', through: '2026-10-10' }, 'site', []);
    expect(prepared.rentals).toHaveLength(1);
    expect(prepared.rentals[0]).toMatchObject({ assetId: uuid(1), pricing: { basePrice: '0.00' }, commercial: { status: 'RESOLVED' } });
    expect(prepared.issues).toEqual([]);
  });

  it('preserves physical initial returns with no source document line and never reopens the old lot on a later remission', async () => {
    const f = fixture();
    f.tx.stockLedger.findMany.mockResolvedValue([{ id: 'native-return', assetId: uuid(1), quantity: new Prisma.Decimal(1), effectiveAt: new Date('2026-10-08T15:00:00Z') },
      { id: 'new-remission', assetId: uuid(1), quantity: new Prisma.Decimal(-1), effectiveAt: new Date('2026-10-09T15:00:00Z') }] as never);
    const projected = await f.project(), docs = [f.parentDocument, ...projected.documents] as any;
    expect(commercialNodesAt(docs, '2026-10-08').some(node => node.assetId === uuid(1))).toBe(true);
    expect(commercialNodesAt(docs, '2026-10-09').some(node => node.assetId === uuid(1))).toBe(false);
    const returns = [{ date: '2026-10-08', quantity: '1', source: { reference: 'native-return', origin: 'INVENTORY' as const } }];
    const lot = { id: 'opening', skuId: uuid(3), assetId: uuid(1), label: 'Equipo Y', deliveredOn: '2026-10-06', quantity: '1',
      source: { reference: 'opening', origin: 'INVENTORY' as const }, returns, pricing: { basePrice: '999' }, waivedDays: [] };
    const prepared = prepareCommercialV2(docs, [{ lot, itemId: projected.entries[0].nodeId }], [],
      { from: '2026-10-01', to: '2026-10-15', through: '2026-10-10' }, 'site', []);
    expect(prepared.rentals.every(row => JSON.stringify(row.returns) === JSON.stringify(returns))).toBe(true);
    expect(prepared.rentals).toHaveLength(1);
  });

  it('never accepts an identity alias from public JSON, a copied projection, a wrong asset or an earlier date', async () => {
    const f = fixture(), projected = await f.project(), item = projected.documents[0].items[0];
    expect(promotedImplementProjectionEvidence(item, '2026-10-06')?.legacyAccessoryId).toBe(uuid(2));
    expect(promotedImplementProjectionEvidence(item, '2026-10-05')).toBeUndefined();
    expect(promotedImplementProjectionEvidence({ ...item }, '2026-10-06')).toBeUndefined();
    item.assetId = uuid(99);
    expect(promotedImplementProjectionEvidence(item, '2026-10-06')).toBeUndefined();
    const publicInput = { period: { from: '2026-10-01', to: '2026-10-15', through: '2026-10-10' },
      policy: { version: 'QA', includeReturnDay: true, excludedWeekdays: [], excludeHolidays: false, holidays: [], holidayCalendarConfirmed: true, minimumHoursPerMachineDay: '6' },
      rentals: [{ id: 'r', skuId: uuid(3), label: 'Equipo', deliveredOn: '2026-10-06', quantity: '1', source: { reference: 'r', origin: 'INVENTORY' }, returns: [], pricing: { basePrice: '0' }, waivedDays: [],
        commercial: { status: 'RESOLVED', parts: [{ documentItemId: 'child', label: 'Equipo Y', quantity: 1, treatment: 'INCLUDED', legacyAccessoryId: uuid(2) }] } }], machineDays: [] };
    expect(annexInputSchema.safeParse(publicInput).success).toBe(false);
  });

  it.each(['missingSnapshot', 'missingParent', 'wrongSite', 'wrongOwner', 'closedParent'] as const)('keeps %s evidence in review instead of inventing a free commercial connection', async kind => {
    const f = fixture();
    if (kind === 'missingSnapshot') delete (f.bridge.evidenceSnapshot as any).frozenCommercialSnapshot;
    if (kind === 'missingParent') delete (f.bridge.evidenceSnapshot as any).parentLegacyOriginId;
    if (kind === 'wrongSite') f.parent.customerWorksiteId = 'different-site';
    if (kind === 'wrongOwner') f.parent.ownerWarehouseId = 'different-owner';
    if (kind === 'closedParent') (f.parent as any).closedAt = new Date('2026-10-05T15:00:00Z');
    const projected = await f.project();
    const snapshots = resolveComposition(commercialNodesAt([f.parentDocument, ...projected.documents] as any, '2026-10-06'));
    expect(snapshots.get('implement-origin:reviewed-promotion')?.status).toBe('REVIEW');
    expect(snapshots.get('implement-origin:reviewed-promotion')?.contextualZero).not.toBe(true);
  });

  it('does not project malformed opening identity or quantities and never reads current prices/profiles or writes history', async () => {
    const f = fixture(); f.opening.assetId = uuid(99);
    expect((await f.project()).entries).toEqual([]);
    f.opening.assetId = uuid(1); f.opening.quantity = new Prisma.Decimal(2);
    expect((await f.project()).entries).toEqual([]);
    expect(Object.keys(f.tx)).toEqual(['implementIdentityBridge', 'stockLedger']);
    expect(f.tx.implementIdentityBridge.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ assetId: { not: null }, OR: expect.arrayContaining([
      { openingLedger: expect.objectContaining({ customerWorksiteId: 'site', refDocumentId: null, isOpeningBalance: true }) },
    ]) }) }));
  });
});
