import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AssetsService } from './assets.service';
import { UpdateAssetConditionDto } from './dto/update-asset-condition.dto';

function fixture(overrides = {}) {
  const asset = { id: 'asset-1', isDamaged: false, deletedAt: null, warehouseCurrentId: 'warehouse-1', warehouseOwnerId: 'warehouse-1', ...overrides };
  const tx = {
    asset: { findUnique: jest.fn().mockResolvedValue(asset), update: jest.fn() },
    assetConditionEvent: { create: jest.fn() },
    stockLedger: { findMany: jest.fn().mockResolvedValue([{ customerWorksiteId: 'site-1' }]) },
  };
  const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
  const cache = { del: jest.fn() };
  const service = new AssetsService(prisma as any, cache as any);
  jest.spyOn(service, 'getAssetById').mockResolvedValue({ id: asset.id } as any);
  return { service, tx, cache, prisma };
}

describe('Asset damage condition', () => {
  it('records the damage and its author without changing activity or physical location', async () => {
    const { service, tx, cache } = fixture();
    await service.updateAssetCondition('asset-1', { isDamaged: true, note: '  No enciende  ' }, 'user-1');
    expect(tx.asset.update).toHaveBeenCalledWith({ where: { id: 'asset-1' }, data: { isDamaged: true, damageNote: 'No enciende' } });
    expect(tx.assetConditionEvent.create).toHaveBeenCalledWith({ data: { assetId: 'asset-1', isDamaged: true, note: 'No enciende', changedByUserId: 'user-1' } });
    expect(cache.del).toHaveBeenCalledWith('inventory:warehouse:warehouse-1:default');
    expect(cache.del).toHaveBeenCalledWith('inventory:on-site:site-1');
  });
  it('records a repair and clears the current damage note without deleting history', async () => {
    const { service, tx } = fixture({ isDamaged: true });
    await service.updateAssetCondition('asset-1', { isDamaged: false, note: 'Motor reparado y probado' }, 'user-1');
    expect(tx.asset.update).toHaveBeenCalledWith({ where: { id: 'asset-1' }, data: { isDamaged: false, damageNote: null } });
    expect(tx.assetConditionEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isDamaged: false, note: 'Motor reparado y probado' }) }));
  });
  it.each(['', '   ', 'a'.repeat(2001)])('rejects an invalid note before writing', async (note) => {
    const { service, prisma } = fixture();
    await expect(service.updateAssetCondition('asset-1', { isDamaged: true, note }, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([{ isDamaged: true }, { deletedAt: new Date() }])('rejects duplicate damage reports and deleted equipment', async (state) => {
    const { service, tx } = fixture(state);
    await expect(service.updateAssetCondition('asset-1', { isDamaged: true, note: 'Falla' }, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.asset.update).not.toHaveBeenCalled();
    expect(tx.assetConditionEvent.create).not.toHaveBeenCalled();
  });
  it('rejects missing equipment', async () => {
    const { service, tx } = fixture();
    tx.asset.findUnique.mockResolvedValue(null);
    await expect(service.updateAssetCondition('missing', { isDamaged: true, note: 'Falla' }, 'user-1')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('validates the HTTP payload and trims whitespace', async () => {
    const valid = plainToInstance(UpdateAssetConditionDto, { isDamaged: false, note: ' Reparado ' });
    expect(await validate(valid)).toHaveLength(0);
    expect(valid.note).toBe('Reparado');
    expect((await validate(plainToInstance(UpdateAssetConditionDto, { isDamaged: 'false', note: '  ' }))).length).toBeGreaterThan(0);
  });
});
