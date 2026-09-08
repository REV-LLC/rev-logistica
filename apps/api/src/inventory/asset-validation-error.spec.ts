import { BadRequestException } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { AssetValidationReason, buildAssetValidationError } from './asset-validation-error';

describe('readable serialized inventory validation errors', () => {
  const assetId = 'cbcd1453-c8f2-4041-9ebf-4ff3ca292684';
  const originId = '599644e8-e921-4b9d-a674-e869bda62279';
  const providerId = '7616b461-2dfb-43a8-a3c7-e1d947cdfbe9';
  const worksiteId = '29b25363-7e26-465d-adfa-36690a46f178';
  const registeredAt = new Date('2026-09-08T13:30:00.000Z');
  const requestedAt = new Date('2026-09-02T17:00:00.000Z');
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  function setup(assetOverrides: Record<string, unknown> = {}) {
    const asset = {
      description: 'MEZCLADORA', brand: 'MARCA', model: 'MODELO', internalNumber: 3,
      sku: { name: 'Mezcladora de concreto' },
      warehouseOwner: { name: 'TECNIREPARACIONES' },
      ...assetOverrides,
    };
    const tx = {
      asset: { findMany: jest.fn().mockResolvedValue([asset]) },
      warehouse: {
        findUnique: jest.fn(async ({ where }) => ({
          name: where.id === originId ? 'Bodega Principal' : 'TECNIREPARACIONES',
        })),
      },
      customerWorksite: {
        findUnique: jest.fn().mockResolvedValue({ alias: 'CASA DE LOS ANDAMIOS', worksite: { name: 'Obra base' } }),
      },
    };
    return { tx, client: tx as unknown as Prisma.TransactionClient };
  }

  function payload(error: BadRequestException): Record<string, any> {
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getStatus()).toBe(400);
    return error.getResponse() as Record<string, any>;
  }

  const origin = { type: 'WAREHOUSE' as const, id: originId };
  const opening = {
    movementType: MovementType.ADJUST, warehouseId: providerId, customerWorksiteId: null,
    effectiveAt: registeredAt, isOpeningBalance: true, quantity: new Prisma.Decimal(1),
  };

  it('identifies the RM009186 mixer and both named locations without claiming it moved away', async () => {
    const { client, tx } = setup();
    const response = payload(await buildAssetValidationError(client, assetId, {
      code: 'ASSET_LOCATION_CONFLICT', reason: 'LOCATION_CONFLICT',
      expectedLocation: origin, latestMovement: opening,
      details: { documentId: 'RM009186' },
    }));
    expect(response.message).toBe('La ubicación registrada del equipo MEZCLADORA #3 (TECNIREPARACIONES) no coincide con el origen del documento. Origen del documento: bodega «Bodega Principal». Ubicación registrada: bodega «TECNIREPARACIONES».');
    expect(response.message).not.toMatch(uuidPattern);
    expect(response.message).not.toContain('ya no está');
    expect(response).toMatchObject({
      code: 'ASSET_LOCATION_CONFLICT', assetId, assetLabel: 'MEZCLADORA #3 (TECNIREPARACIONES)',
      documentId: 'RM009186', latestEffectiveAt: registeredAt,
    });
    expect(tx.asset.findMany).toHaveBeenCalledWith({
      where: { id: { in: [assetId] } },
      select: {
        description: true, brand: true, model: true, internalNumber: true,
        sku: { select: { name: true } }, warehouseOwner: { select: { name: true } },
      },
    });
  });

  it.each<AssetValidationReason>([
    'LOCATION_CONFLICT', 'NO_LOCATION', 'RETROACTIVE', 'NOT_IN_WAREHOUSE',
    'NOT_IN_OWNER_WAREHOUSE', 'NOT_ON_SITE', 'NOT_FOUND', 'OWNER_MISMATCH', 'OWNER_NOT_FOUND',
  ])('does not expose identifiers in a %s message', async (reason) => {
    const { client } = setup();
    const response = payload(await buildAssetValidationError(client, assetId, {
      code: `CODE_${reason}`, reason, expectedLocation: origin, latestMovement: opening,
      requestedEffectiveAt: requestedAt, details: { ownerWarehouseId: providerId },
    }));
    expect(response.message).toContain('MEZCLADORA #3 (TECNIREPARACIONES)');
    expect(response.message).not.toMatch(uuidPattern);
    expect(response).toMatchObject({ code: `CODE_${reason}`, assetId, ownerWarehouseId: providerId });
  });

  it.each([
    [{ description: '  ' }, 'Mezcladora de concreto #3 (TECNIREPARACIONES)'],
    [{ description: null, sku: { name: null } }, 'MARCA MODELO #3 (TECNIREPARACIONES)'],
    [{ description: null, sku: null, brand: null, model: null, warehouseOwner: null }, 'Equipo seleccionado #3'],
    [{ description: `MEZCLADORA ${assetId}`, warehouseOwner: { name: providerId } }, 'MEZCLADORA #3'],
  ])('uses readable catalogue fallbacks for incomplete labels (%j)', async (overrides, expected) => {
    const { client } = setup(overrides);
    const response = payload(await buildAssetValidationError(client, assetId, {
      code: 'ASSET_NO_LOCATION', reason: 'NO_LOCATION',
    }));
    expect(response.assetLabel).toBe(expected);
    expect(response.message).not.toMatch(uuidPattern);
  });

  it('uses a generic selected-equipment message when the asset no longer exists', async () => {
    const { client, tx } = setup();
    tx.asset.findMany.mockResolvedValue([]);
    const response = payload(await buildAssetValidationError(client, assetId, {
      code: 'ASSET_NOT_FOUND', reason: 'NOT_FOUND',
    }));
    expect(response.message).toBe('El equipo seleccionado no se encuentra entre los equipos activos. Actualiza el documento y vuelve a seleccionar el equipo.');
    expect(response.message).not.toMatch(uuidPattern);
    expect(tx.warehouse.findUnique).not.toHaveBeenCalled();
    expect(tx.customerWorksite.findUnique).not.toHaveBeenCalled();
  });

  it('names worksites by alias and keeps the underlying worksite name as a fallback', async () => {
    const { client, tx } = setup();
    const options = {
      code: 'ASSET_LOCATION_CONFLICT', reason: 'LOCATION_CONFLICT' as const,
      expectedLocation: origin,
      latestMovement: { ...opening, movementType: MovementType.OUT, warehouseId: originId, customerWorksiteId: worksiteId },
    };
    const response = payload(await buildAssetValidationError(client, assetId, options));
    expect(response.message).toContain('Ubicación registrada: obra «CASA DE LOS ANDAMIOS».');
    tx.customerWorksite.findUnique.mockResolvedValue({ alias: '', worksite: { name: 'Obra base' } });
    const fallbackResponse = payload(await buildAssetValidationError(client, assetId, options));
    expect(fallbackResponse.message).toContain('Ubicación registrada: obra «Obra base».');
  });

  it('does not mistake an OUT source warehouse for the current location', async () => {
    const { client } = setup();
    const response = payload(await buildAssetValidationError(client, assetId, {
      code: 'ASSET_LOCATION_CONFLICT', reason: 'LOCATION_CONFLICT', expectedLocation: origin,
      latestMovement: { ...opening, movementType: MovementType.OUT },
    }));
    expect(response.message).toContain('Ubicación registrada: no confirmada; el último registro es una salida de bodega «TECNIREPARACIONES».');
    expect(response.message).not.toContain('Ubicación registrada: bodega «TECNIREPARACIONES»');
  });

  it('reports transit without claiming the source is the current warehouse', async () => {
    const { client } = setup();
    const response = payload(await buildAssetValidationError(client, assetId, {
      code: 'ASSET_LOCATION_CONFLICT', reason: 'LOCATION_CONFLICT', expectedLocation: origin,
      latestMovement: { ...opening, movementType: MovementType.TRANSIT },
    }));
    expect(response.message).toContain('Ubicación registrada: en tránsito.');
  });

  it.each([-1, 0, undefined])('does not claim availability from a nonpositive or unknown ADJUST quantity (%s)', async (quantity) => {
    const { client } = setup();
    const response = payload(await buildAssetValidationError(client, assetId, {
      code: 'ASSET_LOCATION_CONFLICT', reason: 'LOCATION_CONFLICT', expectedLocation: origin,
      latestMovement: { ...opening, quantity },
    }));
    expect(response.message).toContain('Ubicación registrada: no confirmada; el último registro es un ajuste');
  });

  it('caches duplicate location reads in the same rejected operation', async () => {
    const { client, tx } = setup();
    await buildAssetValidationError(client, assetId, {
      code: 'ASSET_NOT_IN_WAREHOUSE', reason: 'NOT_IN_WAREHOUSE', expectedLocation: origin,
      latestMovement: { ...opening, warehouseId: originId },
    });
    expect(tx.warehouse.findUnique).toHaveBeenCalledTimes(1);
  });

  it('uses generic named-location fallbacks, not identifiers, for missing warehouse or worksite records', async () => {
    const { client, tx } = setup();
    tx.warehouse.findUnique.mockResolvedValue(null as never);
    tx.customerWorksite.findUnique.mockResolvedValue(null as never);
    const response = payload(await buildAssetValidationError(client, assetId, {
      code: 'ASSET_LOCATION_CONFLICT', reason: 'LOCATION_CONFLICT', expectedLocation: origin,
      latestMovement: { ...opening, movementType: MovementType.ON_SITE, customerWorksiteId: worksiteId },
    }));
    expect(response.message).toContain('Origen del documento: bodega sin nombre registrado.');
    expect(response.message).toContain('Ubicación registrada: obra sin nombre registrado.');
    expect(response.message).not.toMatch(uuidPattern);
  });

  it('formats movement dates in Colombia while preserving machine-readable dates and codes', async () => {
    const { client, tx } = setup();
    const latestEffectiveAt = new Date('2026-09-08T02:30:00.000Z');
    const requestedEffectiveAt = new Date('2026-09-03T02:30:00.000Z');
    const response = payload(await buildAssetValidationError(client, assetId, {
      code: 'RETROACTIVE_INVENTORY_MOVEMENT', reason: 'RETROACTIVE',
      latestMovement: { ...opening, effectiveAt: latestEffectiveAt }, requestedEffectiveAt,
    }));
    expect(response.message).toContain('movimiento del 02/09/2026');
    expect(response.message).toContain('movimiento posterior con fecha 07/09/2026');
    expect(response).toMatchObject({
      code: 'RETROACTIVE_INVENTORY_MOVEMENT', assetId, latestEffectiveAt, requestedEffectiveAt,
    });
    expect(tx.warehouse.findUnique).not.toHaveBeenCalled();
  });

  it('includes local times when a later movement has the same local date', async () => {
    const { client } = setup();
    const response = payload(await buildAssetValidationError(client, assetId, {
      code: 'RETROACTIVE_INVENTORY_MOVEMENT', reason: 'RETROACTIVE',
      latestMovement: { ...opening, effectiveAt: new Date('2026-09-08T13:30:06.000Z') },
      requestedEffectiveAt: new Date('2026-09-08T13:30:01.000Z'),
    }));
    expect(response.message).toContain('movimiento del 08/09/2026 a las 08:30:01');
    expect(response.message).toContain('movimiento posterior con fecha 08/09/2026 a las 08:30:06');
    expect(response.message).not.toContain('registrado el');
  });

  it.each([0, -1])('omits nonpositive internal numbers (%s)', async (internalNumber) => {
    const { client } = setup({ internalNumber });
    const response = payload(await buildAssetValidationError(client, assetId, {
      code: 'ASSET_NO_LOCATION', reason: 'NO_LOCATION',
    }));
    expect(response.assetLabel).toBe('MEZCLADORA (TECNIREPARACIONES)');
    expect(response.message).not.toContain('#');
  });

  it('does not let structured details replace the safe message or canonical error fields', async () => {
    const { client } = setup();
    const response = payload(await buildAssetValidationError(client, assetId, {
      code: 'ASSET_NOT_FOUND', reason: 'NOT_FOUND',
      details: { message: `Error ${assetId}`, code: 'INCORRECT', assetId: providerId },
    }));
    expect(response.message).not.toMatch(uuidPattern);
    expect(response).toMatchObject({ code: 'ASSET_NOT_FOUND', assetId });
  });

  it('does not hide a database error as a successful fallback message', async () => {
    const { client, tx } = setup();
    const databaseError = new Error('Database read failed');
    tx.warehouse.findUnique.mockRejectedValue(databaseError as never);
    await expect(buildAssetValidationError(client, assetId, {
      code: 'ASSET_LOCATION_CONFLICT', reason: 'LOCATION_CONFLICT', expectedLocation: origin,
    })).rejects.toBe(databaseError);
  });
});
