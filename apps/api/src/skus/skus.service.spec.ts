import { BadRequestException } from '@nestjs/common';
import { WarehouseType } from '@prisma/client';
import { SkusService } from './skus.service';

describe('SkusService provider prices', () => {
  const prisma = {
    sku: { findUnique: jest.fn() },
    warehouse: { findUnique: jest.fn() },
    providerSkuPrice: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  };
  const service = new SkusService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('stores one cost for a SKU and provider warehouse', async () => {
    prisma.sku.findUnique.mockResolvedValue({ id: 'sku-1', active: true });
    prisma.warehouse.findUnique.mockResolvedValue({
      id: 'provider-1',
      name: 'VEREAL',
      type: WarehouseType.ALLY,
      active: true,
    });
    prisma.providerSkuPrice.upsert.mockResolvedValue({
      id: 'price-1',
      providerWarehouseId: 'provider-1',
      skuId: 'sku-1',
      price: '42000.00',
      createdAt: new Date('2026-08-04T00:00:00Z'),
      updatedAt: new Date('2026-08-04T00:00:00Z'),
    });

    const result = await service.upsertProviderPrice('sku-1', 'provider-1', 42000);

    expect(prisma.providerSkuPrice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          providerWarehouseId_skuId: {
            providerWarehouseId: 'provider-1',
            skuId: 'sku-1',
          },
        },
        create: { providerWarehouseId: 'provider-1', skuId: 'sku-1', price: 42000 },
        update: { price: 42000 },
      }),
    );
    expect(result.price).toBe(42000);
  });

  it('rejects provider costs for an own warehouse', async () => {
    prisma.sku.findUnique.mockResolvedValue({ id: 'sku-1', active: true });
    prisma.warehouse.findUnique.mockResolvedValue({
      id: 'own-1',
      name: 'BODEGA PRINCIPAL',
      type: WarehouseType.OWN,
      active: true,
    });

    await expect(service.upsertProviderPrice('sku-1', 'own-1', 42000)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.providerSkuPrice.upsert).not.toHaveBeenCalled();
  });

  it('returns provider costs as JSON numbers', async () => {
    prisma.providerSkuPrice.findMany.mockResolvedValue([
      {
        id: 'price-1',
        providerWarehouseId: 'provider-1',
        skuId: 'sku-1',
        price: '42000.00',
        providerWarehouse: { name: 'VEREAL', type: WarehouseType.ALLY },
        sku: { name: 'MOTOBOMBA GASOLINA 3 PULGADAS' },
      },
    ]);

    const result = await service.listProviderPrices({ providerWarehouseId: 'provider-1' });

    expect(result[0].price).toBe(42000);
  });
});
