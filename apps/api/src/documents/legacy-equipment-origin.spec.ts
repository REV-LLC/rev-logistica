import 'reflect-metadata';
import { ROLES_KEY } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { LegacyEquipmentOriginsController } from './legacy-equipment-origins.controller';
import { inspectLegacyEquipmentOrigin, assertLegacyEquipmentOrigin, legacyEffectiveDate } from './legacy-equipment-origin';
import { LegacyEquipmentOriginsService } from './legacy-equipment-origins.service';

function fixture() {
  const source = { id: 'ledger', assetId: 'asset', ownerWarehouseId: 'owner', customerWorksiteId: 'site', warehouseId: null,
    movementType: 'ON_SITE', quantity: 1, isOpeningBalance: false, reversedByDocumentId: null,
    refDocumentId: 'doc', refDocumentType: 'CUTOVER', effectiveAt: new Date('2026-07-29T23:59:59Z'),
    createdAt: new Date('2026-07-30T00:00:00Z'), appendOrder: null,
    asset: { active: true, deletedAt: null, publicCode: 'CODE', internalNumber: 1, sku: { id: 'sku', name: 'Equipo genérico', assetFamilyId: 'family', chargeType: 'DAY', price: null } },
    document: { id: 'doc', status: 'CONFIRMED', type: 'CUTOVER', docDate: new Date('2026-07-29T23:59:59Z'), items: [] },
    customerWorksite: { worksite: { name: 'Obra' } } };
  const tx = { stockLedger: { findUnique: jest.fn().mockResolvedValue(source), findMany: jest.fn().mockResolvedValue([source]) },
    commercialProfile: { findMany: jest.fn().mockResolvedValue([]) },
    legacyEquipmentOrigin: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'bridge', ...data })) },
    $queryRaw: jest.fn().mockResolvedValue([]) };
  const db = { ...tx, $transaction: jest.fn(async fn => fn(tx)) };
  return { source, tx, db, service: new LegacyEquipmentOriginsService(db as never) };
}

describe('Empalmes individuales e inmutables', () => {
  it('un inventario inicial es evidencia propia, no se fabrica una remisión ni tarifa cero', async () => {
    const f = fixture(); const inspected = await inspectLegacyEquipmentOrigin(f.tx as never, 'ledger', '2026-10-01');
    expect(inspected.evidence.documentType).toBe('CUTOVER');
    expect(inspected.evidence.sourceDocumentItemId).toBeNull();
    expect(inspected.commercialSnapshot.status).toBe('REVIEW');
    expect(inspected.commercialSnapshot).not.toHaveProperty('basePrice');
    expect(f.tx.legacyEquipmentOrigin.create).not.toHaveBeenCalled();
  });
  it.each(['2026-09-30', '2026-02-31', '2026-10-32', 'bad'])('rechaza fecha de vigencia inválida %s', date => {
    expect(() => legacyEffectiveDate(date)).toThrow();
  });
  it('conserva fecha civil Bogotá del corte', () => expect(legacyEffectiveDate('2026-10-01').toISOString()).toBe('2026-10-01T05:00:00.000Z'));
  it('rechaza retornos posteriores, otro alquiler y salidas duplicadas', async () => {
    const f = fixture();
    f.tx.stockLedger.findMany.mockResolvedValue([f.source, { ...f.source, id: 'later', movementType: 'IN', effectiveAt: new Date('2026-09-30T12:00Z') }]);
    await expect(f.service.inspect('ledger', '2026-10-01')).rejects.toThrow(/ya no pertenece/);
    f.tx.stockLedger.findMany.mockResolvedValue([f.source, { ...f.source, id: 'earlier', effectiveAt: new Date('2026-07-29T12:00Z') }]);
    await expect(f.service.inspect('ledger', '2026-10-01')).rejects.toThrow(/más de un movimiento/);
  });
  it('revisar exige huella vigente, escribe solo el puente y es idempotente', async () => {
    const f = fixture(); const inspection = await f.service.inspect('ledger', '2026-10-01');
    const input = { sourceLedgerId: 'ledger', effectiveFrom: '2026-10-01', note: 'Revisado contra origen y ubicación', fingerprint: inspection.fingerprint };
    await expect(f.service.review({ ...input, fingerprint: 'stale' }, 'office')).rejects.toThrow(/Cambió la evidencia/);
    const saved = await f.service.review(input, 'office');
    expect(saved.reviewedBy).toBe('office');
    f.tx.legacyEquipmentOrigin.findUnique.mockResolvedValue(saved as never);
    expect(await f.service.review(input, 'office')).toEqual(saved);
    expect(f.tx.legacyEquipmentOrigin.create).toHaveBeenCalledTimes(1);
    expect(f.tx.$queryRaw).toHaveBeenCalled();
  });
  it('no permite usar un puente en otra obra ni antes de su vigencia', async () => {
    const f = fixture(); f.tx.legacyEquipmentOrigin.findUnique.mockResolvedValue({ id: 'bridge', effectiveFrom: new Date('2026-10-01T05:00Z'), sourceLedger: f.source } as never);
    await expect(assertLegacyEquipmentOrigin(f.tx as never, 'bridge', 'other', new Date('2026-10-02T12:00Z'), true)).rejects.toThrow(/obra, fecha/);
    await expect(assertLegacyEquipmentOrigin(f.tx as never, 'bridge', 'site', new Date('2026-09-30T12:00Z'), true)).rejects.toThrow(/obra, fecha/);
  });
  it('Driver puede consumir empalmes aprobados, pero solo Office/Admin revisan', () => {
    expect(Reflect.getMetadata(ROLES_KEY, LegacyEquipmentOriginsController)).toEqual([Role.ADMIN, Role.OFFICE]);
    expect(Reflect.getMetadata(ROLES_KEY, LegacyEquipmentOriginsController.prototype.active)).toContain(Role.DRIVER);
    expect(Reflect.getMetadata(ROLES_KEY, LegacyEquipmentOriginsController.prototype.review)).toBeUndefined();
  });
});
