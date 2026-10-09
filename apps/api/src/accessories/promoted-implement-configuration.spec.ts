import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CommercialProfilesService } from '../commercial-profiles/commercial-profiles.service';
import { EquipmentConfigurationService } from './equipment-configuration.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccessoriesService } from './accessories.service';

describe('promoted implement configuration boundaries', () => {
  it('reads stored legacy limits as recommendations without rewriting inventory or the saved configuration', async () => {
    const assetId = randomUUID();
    const stored = { version: 2, notes: null, entries: [{ id: randomUUID(), familyId: null,
      assetId: randomUUID(), required: true, maximumQuantity: 1, quantity: 1,
      recommendation: false, defaultIncluded: true, asset: null }] };
    const previous = JSON.parse(JSON.stringify(stored));
    const prisma = {
      asset: { findFirst: jest.fn(async () => ({ id: assetId, description: 'Equipo X', internalNumber: 1,
        sku: { name: 'Equipo X', assetFamilyId: randomUUID() }, motorConfiguration: 'NONE',
        warehouseOwnerId: randomUUID(), warehouseCurrentId: null })) },
      equipmentConfiguration: { findUnique: jest.fn(async () => stored) },
    };
    const service = new EquipmentConfigurationService(prisma as unknown as PrismaService, {} as AccessoriesService);
    const view = await service.get({ assetId });
    expect(view.entries[0]).toMatchObject({ required: false, maximumQuantity: null, recommendation: true });
    expect(view.version).toBe(2);
    expect(stored).toEqual(previous);
  });

  it('keeps a legacy commercial profile readable but does not allow edits through the old identity', async () => {
    const accessoryId = randomUUID();
    const accessoryCount = jest.fn(async ({ where }) => where.implementBridge === null ? 0 : 1);
    const tx = { accessory: { count: accessoryCount }, $queryRaw: jest.fn(async () => []),
      commercialProfile: { findUnique: jest.fn(async () => null), create: jest.fn() } };
    const prisma = { ...tx, $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) };
    const service = new CommercialProfilesService(prisma as unknown as PrismaService);
    await expect(service.get('ACCESSORY', accessoryId)).resolves.toMatchObject({
      scopeType: 'ACCESSORY', scopeId: accessoryId, version: 0,
    });
    await expect(service.save({ scopeType: 'ACCESSORY', scopeId: accessoryId,
      expectedVersion: 0, effectiveFrom: '2026-10-06', groups: [], modes: [{
        id: randomUUID(), name: 'Incluido', unit: 'DAY', minimum: { basis: 'PER_RENTAL', value: '0' },
        pricing: { source: 'FIXED', amount: '0' }, conditions: [], parts: [],
      }] }, randomUUID())).rejects.toThrow(NotFoundException);
    expect(accessoryCount).toHaveBeenLastCalledWith({ where: {
      id: { in: [accessoryId] }, implementBridge: null,
    } });
    expect(tx.commercialProfile.create).not.toHaveBeenCalled();
  });

  it('does not reopen the converted legacy identity as an editable configuration owner', async () => {
    const oldId = randomUUID(), nativeId = randomUUID();
    const prisma = {
      accessory: { findFirst: jest.fn(async () => ({ id: oldId, name: 'Implemento X', balances: [],
        familyId: randomUUID(), ownerWarehouseId: randomUUID(), implementBridge: { assetId: nativeId } })) },
      equipmentConfiguration: { findUnique: jest.fn(async () => null) },
    };
    const service = new EquipmentConfigurationService(prisma as unknown as PrismaService,
      {} as AccessoriesService);
    await expect(service.get({ accessoryId: oldId })).rejects.toThrow(BadRequestException);
    await expect(service.get({ accessoryId: oldId })).rejects.toThrow('ya fue convertido a equipo');
  });
});
