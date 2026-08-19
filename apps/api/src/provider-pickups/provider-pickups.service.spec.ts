import {
  DocumentStatus,
  DocumentType,
  MovementType,
  Role,
} from '@prisma/client';
import { ProviderPickupsService } from './provider-pickups.service';

describe('ProviderPickupsService', () => {
  const providerId = '11111111-1111-4111-8111-111111111111';
  const destinationId = '22222222-2222-4222-8222-222222222222';

  it('moves both bulk and serial stock while preserving the provider owner', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 4 });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: '33333333-3333-4333-8333-333333333333',
          type: DocumentType.PROVIDER_PICKUP,
          status: DocumentStatus.DRAFT,
          consecutive: 'TRP000001',
          createdBy: 'user-1',
          providerWarehouseId: providerId,
          warehouseId: destinationId,
          files: [{ id: 'file-1', providerWarehouseId: providerId }],
          providerPickupItems: [
            {
              skuId: '44444444-4444-4444-8444-444444444444',
              assetId: null,
              quantity: 3,
            },
            {
              skuId: null,
              assetId: '55555555-5555-4555-8555-555555555555',
              quantity: 1,
            },
          ],
        }),
        update: jest.fn().mockResolvedValue({
          id: '33333333-3333-4333-8333-333333333333',
          consecutive: 'TRP000001',
          status: DocumentStatus.CONFIRMED,
        }),
      },
      stockLedger: {
        groupBy: jest.fn().mockResolvedValue([
          {
            skuId: '44444444-4444-4444-8444-444444444444',
            assetId: null,
            _sum: { quantity: 4 },
          },
          {
            skuId: null,
            assetId: '55555555-5555-4555-8555-555555555555',
            _sum: { quantity: 1 },
          },
        ]),
        createMany,
      },
      sku: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: '44444444-4444-4444-8444-444444444444' }]),
      },
      asset: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: '55555555-5555-4555-8555-555555555555' }]),
        updateMany,
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const cache = { del: jest.fn().mockResolvedValue(undefined) };
    const service = new ProviderPickupsService(prisma as never, cache as never);

    await expect(
      service.confirm('33333333-3333-4333-8333-333333333333', {
        id: 'user-1',
        role: Role.OFFICE,
      }),
    ).resolves.toMatchObject({
      consecutive: 'TRP000001',
      status: DocumentStatus.CONFIRMED,
    });

    const movements = createMany.mock.calls[0][0].data;
    expect(movements).toHaveLength(4);
    expect(movements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          movementType: MovementType.OUT,
          warehouseId: providerId,
          ownerWarehouseId: providerId,
          quantity: expect.objectContaining({}),
        }),
        expect.objectContaining({
          movementType: MovementType.IN,
          warehouseId: destinationId,
          ownerWarehouseId: providerId,
          refDocumentType: DocumentType.PROVIDER_PICKUP,
        }),
      ]),
    );
    expect(Number(movements[0].quantity)).toBe(-3);
    expect(Number(movements[1].quantity)).toBe(3);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { warehouseCurrentId: destinationId },
      }),
    );
    expect(cache.del).toHaveBeenCalledTimes(6);
  });

  it('rejects confirmation when source stock changed after the draft was created', async () => {
    const createMany = jest.fn();
    const tx = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: '33333333-3333-4333-8333-333333333333',
          type: DocumentType.PROVIDER_PICKUP,
          status: DocumentStatus.DRAFT,
          consecutive: 'TRP000002',
          createdBy: 'user-1',
          providerWarehouseId: providerId,
          warehouseId: destinationId,
          files: [{ id: 'file-1', providerWarehouseId: providerId }],
          providerPickupItems: [
            {
              skuId: '44444444-4444-4444-8444-444444444444',
              assetId: null,
              quantity: 3,
            },
          ],
        }),
      },
      stockLedger: {
        groupBy: jest.fn().mockResolvedValue([
          {
            skuId: '44444444-4444-4444-8444-444444444444',
            assetId: null,
            _sum: { quantity: 2 },
          },
        ]),
        createMany,
      },
      sku: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: '44444444-4444-4444-8444-444444444444' }]),
      },
      asset: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new ProviderPickupsService(
      prisma as never,
      { del: jest.fn() } as never,
    );

    await expect(
      service.confirm('33333333-3333-4333-8333-333333333333', {
        id: 'user-1',
        role: Role.OFFICE,
      }),
    ).rejects.toThrow('Inventario insuficiente');
    expect(createMany).not.toHaveBeenCalled();
  });
});
