import { Prisma } from '@prisma/client';
import { applyCatalogQuantityBasis } from './annex-quantity-basis';
import type { AnnexInput } from './annex-input';
const rental = (label = 'Referencia nueva'): AnnexInput['rentals'][number] => ({
  id: 'lot', skuId: 'sku', label, deliveredOn: '2026-10-01', quantity: '3',
  source: { reference: 'rem', origin: 'INVENTORY' }, returns: [], waivedDays: [], pricing: { basePrice: '2750' },
});
const sku = (basis = 'UNIT', area: string | null = '0.72') => ({
  id: 'sku', rentalQuantityBasis: basis, chargeType: 'DAY', areaM2: area === null ? null : new Prisma.Decimal(area),
});
describe('explicit catalog rental quantity basis', () => {
  it('does not activate area billing from a name, dimensions, or family convention', () => {
    for (const label of ['FORMALETA', 'RINCONERA', 'Equipo nuevo']) {
      const row = rental(label); applyCatalogQuantityBasis([row], [sku()]);
      expect(row.billingAreaM2).toBeUndefined(); expect(row.quantity).toBe('3');
    }
  });
  it('applies the configured area to any named reference and snapshots it', () => {
    const row = rental('Panel nuevo creado mañana'); const catalog = sku('AREA_M2');
    applyCatalogQuantityBasis([row], [catalog]);
    catalog.areaM2 = new Prisma.Decimal('4');
    expect(row.billingAreaM2).toBe('0.72'); expect(row.quantity).toBe('3');
  });
  it.each([null, '0', '-1'])('blocks area billing with missing or invalid area %s', area => {
    expect(() => applyCatalogQuantityBasis([rental()], [sku('AREA_M2', area)])).toThrow('área por pieza');
  });
  it('does not reinterpret a pre-existing commercial agreement silently', () => {
    const row = rental(); row.includedIn = { label: 'Conjunto', reference: 'parent' } as never;
    expect(() => applyCatalogQuantityBasis([row], [sku('AREA_M2')])).toThrow('modalidad comercial');
  });
});
