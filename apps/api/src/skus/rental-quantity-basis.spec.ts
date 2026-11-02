import { SkusService } from './skus.service';
import { validateRentalQuantityBasis } from './rental-quantity-basis';

describe('rental quantity basis configuration', () => {
  it('permits unit billing with or without area', () => {
    expect(() => validateRentalQuantityBasis('UNIT', 'DAY', 'BULK', 0.72)).not.toThrow();
    expect(() => validateRentalQuantityBasis('UNIT', 'DAY', 'BULK', null)).not.toThrow();
  });
  it('validates the supported combination and positive area', () => {
    expect(() => validateRentalQuantityBasis('AREA_M2', 'DAY', 'BULK', 0.72)).not.toThrow();
    for (const area of [null, 0, -1, NaN, Infinity, 0.0000001])
      expect(() => validateRentalQuantityBasis('AREA_M2', 'DAY', 'BULK', area)).toThrow();
    expect(() => validateRentalQuantityBasis('AREA_M2', 'HOUR', 'BULK', 1)).toThrow();
    expect(() => validateRentalQuantityBasis('AREA_M2', 'DAY', 'SERIAL', 1)).toThrow();
  });
  const current = { id: 'sku', name: 'Panel', assetFamilyId: 'family', chargeType: 'DAY',
    rentalQuantityBasis: 'UNIT', areaM2: null, isImplement: false, isConsumable: false };
  const prisma = { sku: { findUnique: jest.fn(), update: jest.fn() }, assetFamily: { findUnique: jest.fn() } };
  beforeEach(() => {
    jest.clearAllMocks(); prisma.sku.findUnique.mockResolvedValue(current);
    prisma.assetFamily.findUnique.mockResolvedValue({ id: 'family', controlType: 'BULK', name: 'Paneles', code: 'PN' });
    prisma.sku.update.mockImplementation(async ({ data }) => ({ ...current, ...data, assetFamily: {controlType:'BULK'} }));
  });
  it('persists the explicit choice and area through the catalog update', async () => {
    const service = new SkusService(prisma as never);
    await service.updateSku('sku', { rentalQuantityBasis: 'AREA_M2', areaM2: 0.72 });
    expect(prisma.sku.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ rentalQuantityBasis: 'AREA_M2', areaM2: 0.72 }) }));
  });
  it('rejects an incomplete choice without writing', async () => {
    const service = new SkusService(prisma as never);
    await expect(service.updateSku('sku', { rentalQuantityBasis: 'AREA_M2' })).rejects.toThrow('área por pieza');
    expect(prisma.sku.update).not.toHaveBeenCalled();
  });
  it('preserves an existing area basis during unrelated edits and allows returning to units', async () => {
    prisma.sku.findUnique.mockResolvedValue({ ...current, rentalQuantityBasis: 'AREA_M2', areaM2: 0.72 });
    const service = new SkusService(prisma as never);
    await service.updateSku('sku', { name: 'Panel nuevo' });
    expect(prisma.sku.update).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({rentalQuantityBasis:undefined})}));
    await service.updateSku('sku', { rentalQuantityBasis: 'UNIT' });
    expect(prisma.sku.update).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({rentalQuantityBasis:'UNIT'})}));
  });
});
