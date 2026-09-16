import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import {
  isCompatible,
  locationKey,
  validateMovement,
  validateScope,
} from './accessory-rules';
import { CreateAccessoryDto, MoveAccessoryDto } from './dto/accessory.dto';

const asset = {
  id: 'a',
  sku: { assetFamilyId: 'pluma', assetSubfamilyId: '200kg' },
};
const family = {
  familyId: 'pluma',
  scope: 'FAMILY' as const,
  subfamilyIds: [],
  assetIds: [],
};

describe('Accessory compatibility', () => {
  it('restricts a hydraulic hammer to the selected Liu Gong, not other machines in its family', () => {
    const rule = {
      familyId: 'retro',
      scope: 'ASSETS' as const,
      assetIds: ['liu-gong'],
      subfamilyIds: [],
    };
    expect(
      isCompatible(rule, {
        id: 'liu-gong',
        sku: { assetFamilyId: 'retro', assetSubfamilyId: 'standard' },
      }),
    ).toBe(true);
    expect(
      isCompatible(rule, {
        id: 'komatsu',
        sku: { assetFamilyId: 'retro', assetSubfamilyId: 'standard' },
      }),
    ).toBe(false);
  });
  it('includes current and future equipment in a family', () => {
    expect(isCompatible(family, asset)).toBe(true);
    expect(isCompatible(family, { ...asset, id: 'future' })).toBe(true);
    expect(isCompatible({ ...family, familyId: 'retro' }, asset)).toBe(false);
  });
  it('matches subfamilies, not just the parent family', () => {
    expect(
      isCompatible(
        { ...family, scope: 'SUBFAMILIES', subfamilyIds: ['200kg'] },
        asset,
      ),
    ).toBe(true);
    expect(
      isCompatible(
        { ...family, scope: 'SUBFAMILIES', subfamilyIds: ['300kg'] },
        asset,
      ),
    ).toBe(false);
  });
  it('matches only explicitly selected equipment', () => {
    expect(
      isCompatible({ ...family, scope: 'ASSETS', assetIds: ['a'] }, asset),
    ).toBe(true);
    expect(
      isCompatible({ ...family, scope: 'ASSETS', assetIds: ['b'] }, asset),
    ).toBe(false);
  });
  it.each([
    { ...family, assetIds: ['a'] },
    { ...family, scope: 'SUBFAMILIES' as const },
    { ...family, scope: 'ASSETS' as const },
    {
      ...family,
      scope: 'ASSETS' as const,
      assetIds: ['a'],
      subfamilyIds: ['200kg'],
    },
  ])('rejects ambiguous or empty compatibility: %j', (rule) =>
    expect(() => validateScope(rule)).toThrow(),
  );
});

describe('Accessory movements', () => {
  it('distinguishes equipment custody from warehouse stock', () => {
    expect(locationKey({ assetId: 'a' })).toBe('asset:a');
    expect(locationKey({ warehouseId: 'w' })).toBe('warehouse:w');
    expect(() => locationKey({ assetId: 'a', warehouseId: 'w' })).toThrow();
    expect(() => locationKey({})).toThrow();
  });
  it.each([0, -1, 0.5, 1000001, NaN])(
    'rejects invalid quantity %s',
    (quantity) => {
      expect(() =>
        validateMovement('CONSUMABLE', 'CONSUME', quantity, { assetId: 'a' }),
      ).toThrow();
    },
  );
  it('permits the full consumable lifecycle without consuming the delivery', () => {
    expect(() =>
      validateMovement(
        'CONSUMABLE',
        'ASSIGN',
        10,
        { warehouseId: 'w' },
        { assetId: 'a' },
      ),
    ).not.toThrow();
    expect(() =>
      validateMovement('CONSUMABLE', 'CONSUME', 6, { assetId: 'a' }),
    ).not.toThrow();
    expect(() =>
      validateMovement(
        'CONSUMABLE',
        'RETURN',
        4,
        { assetId: 'a' },
        { warehouseId: 'w' },
      ),
    ).not.toThrow();
  });
  it('individualized accessories can be exchanged and retired but not consumed or replenished', () => {
    expect(() =>
      validateMovement(
        'INDIVIDUAL',
        'TRANSFER',
        1,
        { assetId: 'a' },
        { assetId: 'b' },
      ),
    ).not.toThrow();
    expect(() =>
      validateMovement('INDIVIDUAL', 'RETIRE', 1, { assetId: 'a' }),
    ).not.toThrow();
    expect(() =>
      validateMovement('INDIVIDUAL', 'CONSUME', 1, { assetId: 'a' }),
    ).toThrow();
    expect(() =>
      validateMovement('INDIVIDUAL', 'RECEIVE', 1, undefined, {
        warehouseId: 'w',
      }),
    ).toThrow();
    expect(() =>
      validateMovement(
        'INDIVIDUAL',
        'ASSIGN',
        2,
        { warehouseId: 'w' },
        { assetId: 'a' },
      ),
    ).toThrow();
  });
  it('returnables can be replenished, assigned and partially returned but never consumed', () => {
    expect(() =>
      validateMovement('RETURNABLE', 'RECEIVE', 10, undefined, {
        warehouseId: 'w',
      }),
    ).not.toThrow();
    expect(() =>
      validateMovement(
        'RETURNABLE',
        'ASSIGN',
        6,
        { warehouseId: 'w' },
        { assetId: 'a' },
      ),
    ).not.toThrow();
    expect(() =>
      validateMovement(
        'RETURNABLE',
        'RETURN',
        2,
        { assetId: 'a' },
        { warehouseId: 'w' },
      ),
    ).not.toThrow();
    expect(() =>
      validateMovement('RETURNABLE', 'CONSUME', 1, { assetId: 'a' }),
    ).toThrow('Solo los consumibles');
    expect(() =>
      validateMovement('RETURNABLE', 'RETIRE', 1, { assetId: 'a' }),
    ).not.toThrow();
    expect(() =>
      validateMovement(
        'RETURNABLE',
        'RETURN',
        1.5,
        { assetId: 'a' },
        { warehouseId: 'w' },
      ),
    ).toThrow();
  });
  it('rejects reversed deliveries and identical destinations', () => {
    expect(() =>
      validateMovement(
        'INDIVIDUAL',
        'ASSIGN',
        1,
        { assetId: 'a' },
        { warehouseId: 'w' },
      ),
    ).toThrow();
    expect(() =>
      validateMovement(
        'INDIVIDUAL',
        'TRANSFER',
        1,
        { assetId: 'a' },
        { assetId: 'a' },
      ),
    ).toThrow();
    expect(() =>
      validateMovement(
        'CONSUMABLE',
        'CONSUME',
        1,
        { assetId: 'a' },
        { warehouseId: 'w' },
      ),
    ).toThrow();
  });
});

describe('Accessory request validation', () => {
  it('validates nested locations and rejects unknown properties', async () => {
    const dto = plainToInstance(MoveAccessoryDto, {
      requestId: randomUUID(),
      type: 'ASSIGN',
      quantity: 1,
      note: 'Entrega',
      from: { warehouseId: 'bad' },
      to: { assetId: randomUUID(), quantity: 999 },
    });
    expect(
      (await validate(dto, { whitelist: true, forbidNonWhitelisted: true }))
        .length,
    ).toBeGreaterThan(0);
  });
  it('rejects repeated targets and decimal quantities', async () => {
    const id = randomUUID();
    const dto = plainToInstance(CreateAccessoryDto, {
      requestId: randomUUID(),
      name: 'Puntas',
      kind: 'CONSUMABLE',
      scope: 'ASSETS',
      familyId: randomUUID(),
      assetIds: [id, id],
      subfamilyIds: [],
      ownerWarehouseId: randomUUID(),
      warehouseId: randomUUID(),
      quantity: 1.2,
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['assetIds', 'quantity']),
    );
  });
});
