import { randomUUID } from 'node:crypto';
import { ImplementPromotionService, promotionBalance, promotionFingerprint, replacePromotedSelector } from './implement-promotion.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('reviewed individual implement promotion', () => {
  const warehouse = randomUUID();
  const sourceId = randomUUID();
  const skuId = randomUUID();
  const actorId = randomUUID();
  const input = { accessoryId: sourceId, skuId, effectiveAt: new Date('2026-10-06T16:00:00Z'), assetDescription: 'Unidad propia' };
  const warehouseBalance = { quantity: 1, warehouseId: warehouse, assetId: null, customerWorksiteId: null, transitDocumentId: null };
  function fixture() {
    const source = { id: sourceId, active: true, kind: 'INDIVIDUAL', name: 'Nombre anterior', ownerWarehouseId: warehouse,
      familyId: 'parent-family', createdAt: new Date('2026-10-01T12:00:00Z'), scope: 'ASSETS', exclusiveAssetId: null,
      balances: [warehouseBalance], movements: [], revisions: [], assets: [], subfamilies: [],
      compatibleParents: [], compatibleChildren: [], configuration: null };
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: sourceId }]),
      user: { findUnique: jest.fn().mockResolvedValue({ id: actorId, role: 'OFFICE', active: true }) },
      implementIdentityBridge: { findUnique: jest.fn().mockResolvedValue(null) },
      accessory: { findUnique: jest.fn().mockResolvedValue(source) },
      documentItem: { count: jest.fn().mockResolvedValue(0) },
      accessoryProviderReceiptItem: { count: jest.fn().mockResolvedValue(0) },
      sku: { findUnique: jest.fn().mockResolvedValue({ id: skuId, active: true, isConsumable: false,
        assetFamilyId: 'unit-family', assetSubfamilyId: 'subfamily', assetFamily: { code: 'UNIT', controlType: 'SERIAL' },
        assetSubfamily: { id: 'subfamily', active: true, assetFamilyId: 'unit-family', code: 'STANDARD' } }) },
      warehouse: { findUnique: jest.fn().mockResolvedValue({ id: warehouse, name: 'Propietario' }) },
      equipmentConfiguration: { findMany: jest.fn().mockResolvedValue([]) },
      commercialProfile: { findMany: jest.fn().mockResolvedValue([]) },
      asset: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    };
    return { source, tx, service: new ImplementPromotionService({} as PrismaService) };
  }
  it('permits exactly one positive unit without deleting historical zero balances', () => {
    expect(promotionBalance([warehouseBalance, { ...warehouseBalance, quantity: 0 }])).toBe(warehouseBalance);
    for (const balances of [[], [{ ...warehouseBalance, quantity: 2 }], [warehouseBalance, warehouseBalance],
      [{ ...warehouseBalance, quantity: -1 }], [{ ...warehouseBalance, transitDocumentId: randomUUID() }],
      [{ ...warehouseBalance, assetId: randomUUID() }]])
      expect(() => promotionBalance(balances)).toThrow();
  });
  it('replaces only the explicit commercial selector and retains prices, modes and unrelated units', () => {
    const payload = { groups: [{ id: 'group', name: 'Equipo', selectors: [
      { kind: 'ACCESSORY', id: sourceId }, { kind: 'ACCESSORY', id: 'another' }, { kind: 'ASSET', id: sourceId } ] }],
      modes: [{ pricing: { source: 'FIXED', amount: '45000.50' }, minimum: { value: '3', basis: 'PER_REPORTED_DAY' } }] };
    const changed = replacePromotedSelector(payload, sourceId, 'native') as any;
    expect(changed.groups[0].selectors).toEqual([{ kind: 'ASSET', id: 'native' },
      { kind: 'ACCESSORY', id: 'another' }, { kind: 'ASSET', id: sourceId }]);
    expect(changed.modes).toEqual(payload.modes);
    expect(payload.groups[0].selectors[0]).toEqual({ kind: 'ACCESSORY', id: sourceId });
  });
  it('uses deterministic fingerprints regardless of object key order', () => {
    expect(promotionFingerprint({ a: 1, b: { c: 2 } })).toBe(promotionFingerprint({ b: { c: 2 }, a: 1 }));
    expect(promotionFingerprint({ a: 1 })).not.toBe(promotionFingerprint({ a: 2 }));
  });
  it('previews a unit without any write or inferred unit links', async () => {
    const f = fixture();
    const plan = await f.service.previewInTransaction(f.tx, input, actorId);
    expect(plan.status).toBe('READY');
    expect(f.tx.asset.create).not.toHaveBeenCalled();
    expect(f.tx.$queryRaw).not.toHaveBeenCalled();
    expect(f.source.name).toBe('Nombre anterior');
  });
  it('refuses documentary, transit and nested custody rather than rewriting it', async () => {
    const documents = fixture(); documents.tx.documentItem.count.mockResolvedValue(1);
    await expect(documents.service.previewInTransaction(documents.tx, input, actorId)).rejects.toThrow('documentos');
    const receipt = fixture(); receipt.tx.accessoryProviderReceiptItem.count.mockResolvedValue(1);
    await expect(receipt.service.previewInTransaction(receipt.tx, input, actorId)).rejects.toThrow('recepciones');
    const movement = fixture(); (movement.source.movements as any[]).push({ documentId: randomUUID() });
    await expect(movement.service.previewInTransaction(movement.tx, input, actorId)).rejects.toThrow('documentos');
    const nested = fixture(); (nested.source.compatibleChildren as any[]).push({ accessoryId: randomUUID() });
    await expect(nested.service.previewInTransaction(nested.tx, input, actorId)).rejects.toThrow('anidadas');
  });
  it('never individualizes quantities but permits an explicitly reviewed shared SERIAL family', async () => {
    const bulk = fixture(); bulk.source.kind = 'RETURNABLE';
    await expect(bulk.service.previewInTransaction(bulk.tx, input, actorId)).rejects.toThrow('individualizada');
    const sameFamily = fixture(); sameFamily.tx.sku.findUnique.mockResolvedValue({ active: true,
      assetFamilyId: 'parent-family', assetFamily: { controlType: 'SERIAL' },
      assetSubfamily: { active: true, assetFamilyId: 'parent-family' } });
    await expect(sameFamily.service.previewInTransaction(sameFamily.tx, input, actorId)).resolves.toMatchObject({ status: 'READY' });
  });
  it('includes the reviewed internal number in the fingerprint and refuses an occupied number', async () => {
    const f = fixture();
    const numbered = { ...input, internalNumber: 2 };
    const plan = await f.service.previewInTransaction(f.tx, numbered, actorId);
    expect(plan.status).toBe('READY');
    const automatic = await f.service.previewInTransaction(f.tx, input, actorId);
    if (plan.status === 'READY' && automatic.status === 'READY') expect(plan.fingerprint).not.toBe(automatic.fingerprint);
    f.tx.asset.findFirst.mockResolvedValue({ id: randomUUID() });
    await expect(f.service.previewInTransaction(f.tx, numbered, actorId)).rejects.toThrow('ya pertenece');
    for (const internalNumber of [0, -1, 2.5, 2147483647])
      await expect(f.service.previewInTransaction(f.tx, { ...input, internalNumber }, actorId)).rejects.toThrow('identidades exactas');
  });
  it('rejects stale review after acquiring the source lock and before creating stock', async () => {
    const f = fixture();
    await expect(f.service.promoteInTransaction(f.tx, input, actorId, '0'.repeat(64))).rejects.toThrow('cambió');
    expect(f.tx.asset.create).not.toHaveBeenCalled();
    expect(f.tx.$queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE');
  });
});
