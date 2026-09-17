import { Prisma } from '@prisma/client';
import { AccessoriesService } from './accessories.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccessoryDto } from './dto/accessory.dto';

const dto: CreateAccessoryDto = {
  name: 'BACHE',
  kind: 'INDIVIDUAL',
  familyId: 'family',
  scope: 'FAMILY',
  subfamilyIds: [],
  assetIds: [],
  ownerWarehouseId: 'warehouse',
  warehouseId: 'warehouse',
  quantity: 1,
  requestId: 'request',
};
const duplicate = (field: string) =>
  new Prisma.PrismaClientKnownRequestError('Duplicate', {
    code: 'P2002',
    clientVersion: '6',
    meta: { target: [field] },
  });

function setup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    accessory: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(async ({ data }) => ({ id: 'new', ...data })),
    },
    assetFamily: {
      findUnique: jest.fn().mockResolvedValue({ controlType: 'SERIAL' }),
    },
    warehouse: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'warehouse', name: 'BODEGA' }),
    },
  };
  const prisma = { $transaction: jest.fn().mockImplementation((fn) => fn(tx)) };
  return {
    tx,
    prisma,
    service: new AccessoriesService(prisma as unknown as PrismaService),
  };
}

describe('Automatic accessory codes', () => {
  it.each([undefined, '', '  '])(
    'generates a code for blank input %j without changing the request',
    async (internalCode) => {
      const { service } = setup();
      const input = { ...dto, internalCode };
      const result = await service.create(input, 'office');
      expect(result.internalCode).toMatch(/^ACC-[A-F0-9]{12}$/);
      expect(input.internalCode).toBe(internalCode);
    },
  );

  it('retains a manually entered code and its normalisation', async () => {
    const { service } = setup();
    expect(
      (await service.create({ ...dto, internalCode: ' bache-01 ' }, 'office'))
        .internalCode,
    ).toBe('BACHE-01');
  });

  it.each(['CONSUMABLE', 'RETURNABLE'] as const)(
    'does not generate individual codes for %s',
    async (kind) => {
      const { service } = setup();
      expect(
        (await service.create({ ...dto, kind }, 'office')).internalCode,
      ).toBeNull();
    },
  );

  it('returns the same generated code and stock on replay', async () => {
    const { service, tx } = setup();
    const first = await service.create(dto, 'office');
    tx.accessory.findUnique.mockResolvedValue(first);
    expect(await service.create(dto, 'office')).toEqual(first);
    expect(tx.accessory.create).toHaveBeenCalledTimes(1);
    await expect(
      service.create({ ...dto, name: 'Changed' }, 'office'),
    ).rejects.toThrow('otros datos');
  });

  it('retries a generated-code collision in a fresh transaction', async () => {
    const { service, tx, prisma } = setup();
    tx.accessory.create.mockRejectedValueOnce(duplicate('internalCode'));
    const result = await service.create(dto, 'office');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.accessory.create.mock.calls[0][0].data.internalCode).not.toBe(
      result.internalCode,
    );
  });

  it('bounds generated-code collision retries', async () => {
    const { service, tx, prisma } = setup();
    tx.accessory.create.mockRejectedValue(duplicate('internalCode'));
    await expect(service.create(dto, 'office')).rejects.toThrow('ya existe');
    expect(prisma.$transaction).toHaveBeenCalledTimes(5);
  });

  it.each([
    { internalCode: 'EXISTING', field: 'internalCode' },
    { internalCode: undefined, field: 'creationRequestId' },
  ])(
    'does not retry manual codes or unrelated unique violations: %j',
    async ({ internalCode, field }) => {
      const { service, tx, prisma } = setup();
      tx.accessory.create.mockRejectedValue(duplicate(field));
      await expect(
        service.create({ ...dto, internalCode }, 'office'),
      ).rejects.toThrow('ya existe');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    },
  );
});
