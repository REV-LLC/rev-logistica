import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  EquipmentConfigurationDto,
  EquipmentConfigurationEntryDto,
} from './dto/equipment-configuration.dto';
import {
  assertAcyclicConfiguration,
  implementRecommendationRules,
  validateConfigurationDraft,
} from './equipment-configuration-rules';

const row = (
  changes: Partial<EquipmentConfigurationEntryDto> = {},
): EquipmentConfigurationEntryDto => ({
  id: randomUUID(),
  role: 'COMPONENT',
  quantity: 1,
  defaultIncluded: true,
  required: false,
  newPart: {
    name: 'TECHO DD-29',
    kind: 'INDIVIDUAL',
    initialQuantity: 1,
    exclusive: true,
  },
  ...changes,
});
const check = (...entries: EquipmentConfigurationEntryDto[]) =>
  validateConfigurationDraft({ version: 0, entries });
const familyRow = (
  familyId: string,
  templateParentFamilyId: string | null = null,
): EquipmentConfigurationEntryDto => row({
  familyId,
  templateParentFamilyId,
  newPart: undefined,
  defaultIncluded: false,
  recommendation: true,
});

describe('Equipment configuration invariants', () => {
  it('normalizes old requirements and quantity limits as non-blocking recommendations', () => {
    for (const change of [{ required: true }, { maximumQuantity: 1 }, { familyId: randomUUID() }, { defaultIncluded: true }]) {
      expect(implementRecommendationRules(row({ defaultIncluded: false, ...change }))).toEqual({
        recommendation: true, required: false, maximumQuantity: null,
      });
    }
    expect(implementRecommendationRules(row({ defaultIncluded: false }))).toEqual({
      recommendation: false, required: false, maximumQuantity: null,
    });
  });
  it('accepts equipment without parts, optional default roof and required non-default guaya', () => {
    expect(() => check()).not.toThrow();
    expect(() =>
      check(
        row(),
        row({
          role: 'ACCESSORY',
          defaultIncluded: false,
          required: true,
          newPart: {
            name: 'GUAYA',
            kind: 'INDIVIDUAL',
            initialQuantity: 1,
            exclusive: false,
          },
        }),
      ),
    ).not.toThrow();
  });
  it('supports optional consumables and returnables by quantity without consuming them', () => {
    for (const kind of ['CONSUMABLE', 'RETURNABLE'] as const) {
      expect(() =>
        check(
          row({
            role: 'ACCESSORY',
            quantity: 2,
            defaultIncluded: false,
            newPart: {
              name: 'PUNTAS / MANGUERAS',
              kind,
              initialQuantity: 10,
              exclusive: false,
            },
          }),
        ),
      ).not.toThrow();
    }
  });
  it('rejects duplicate identities and ambiguous targets', () => {
    const first = row();
    expect(() => check(first, first)).toThrow('filas duplicadas');
    expect(() => check(row({ assetId: randomUUID() }))).toThrow('no ambos');
    expect(() => check(row({ newPart: undefined }))).toThrow('Cada fila');
    const assetId = randomUUID();
    expect(() =>
      check(
        row({ newPart: undefined, assetId }),
        row({ newPart: undefined, assetId }),
      ),
    ).toThrow('repetirse');
  });
  it('does not turn exclusive components into bulk stock or accessory exclusivity', () => {
    expect(() => check(row({ quantity: 2 }))).toThrow('una unidad');
    expect(() => check(row({ role: 'ACCESSORY' }))).toThrow(
      'pertenencia exclusiva',
    );
    expect(() =>
      check(
        row({
          newPart: {
            name: 'TECHO',
            kind: 'CONSUMABLE',
            initialQuantity: 1,
            exclusive: false,
          },
        }),
      ),
    ).toThrow('identidad individual');
  });
  it('rejects negative, fractional or unbounded quantities', () => {
    for (const quantity of [-1, 0, 0.5, 1000001, NaN])
      expect(() => check(row({ quantity }))).toThrow();
  });
  it('accepts nested/shared configurations but rejects direct and indirect cycles', () => {
    expect(() =>
      assertAcyclicConfiguration('compressor', [
        ['compressor', 'apt'],
        ['apt', 'tip'],
      ]),
    ).not.toThrow();
    expect(() =>
      assertAcyclicConfiguration('root', [
        ['root', 'a'],
        ['root', 'b'],
        ['a', 'c'],
        ['b', 'c'],
      ]),
    ).not.toThrow();
    expect(() => assertAcyclicConfiguration('a', [['a', 'a']])).toThrow(
      'sí mismo',
    );
    expect(() =>
      assertAcyclicConfiguration('a', [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'],
      ]),
    ).toThrow('sí mismo');
  });
  it('rejects malformed HTTP payloads and fields that could mutate stock', async () => {
    const dto = plainToInstance(EquipmentConfigurationDto, {
      version: 0,
      entries: [row()],
    });
    expect(
      await validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).toHaveLength(0);
    const invalid = plainToInstance(EquipmentConfigurationDto, {
      version: -1,
      entries: [
        {
          ...row(),
          required: 'false',
          warehouseId: randomUUID(),
          newPart: { name: 'TIP' },
        },
      ],
    });
    expect(
      (await validate(invalid, { whitelist: true, forbidNonWhitelisted: true }))
        .length,
    ).toBeGreaterThan(0);
  });
  it('enforces maximum depth even when a shared subtree was visited by a shorter path', () => {
    const edges: Array<[string, string]> = [
      ['root', 'shared'],
      ['shared', 'leaf'],
      ['root', 'n0'],
    ];
    for (let i = 0; i < 14; i++) edges.push([`n${i}`, `n${i + 1}`]);
    edges.push(['n14', 'shared']);
    expect(() => assertAcyclicConfiguration('root', edges)).toThrow(
      '16 niveles',
    );
  });

  it('accepts an explicit family route, branches and independent root recommendations', () => {
    const hose = randomUUID(), hammer = randomUUID(), tip = randomUUID(), other = randomUUID();
    // Presentation order does not create or change dependency edges.
    expect(() => check(
      familyRow(tip, hammer), familyRow(other),
      familyRow(hammer, hose), familyRow(hose),
    )).not.toThrow();
    expect(() => check(
      familyRow(hose), familyRow(hammer, hose), familyRow(tip, hose),
    )).not.toThrow();
  });

  it('rejects a family parent outside the same route, including removing a used parent', () => {
    const hose = randomUUID(), hammer = randomUUID();
    expect(() => check(familyRow(hammer, hose))).toThrow('misma ruta');
    expect(() => check(familyRow(hammer, hose),
      row({ newPart: undefined, assetId: hose }),
    )).toThrow('misma ruta');
  });

  it('rejects family self-dependencies and cycles disconnected from the principal asset', () => {
    const a = randomUUID(), b = randomUUID(), c = randomUUID();
    expect(() => check(familyRow(a, a))).toThrow('sí misma');
    expect(() => check(
      familyRow(c), familyRow(a, b), familyRow(b, a),
    )).toThrow('ciclos');
  });

  it('does not attach physical asset, bulk SKU or historical accessory entries to a family route', () => {
    for (const target of [
      { assetId: randomUUID() }, { skuId: randomUUID() }, { accessoryId: randomUUID() },
    ]) {
      expect(() => check(row({
        ...target, newPart: undefined, templateParentFamilyId: randomUUID(),
      }))).toThrow('no unidades concretas');
      expect(() => check(row({
        ...target, newPart: undefined, templateParentFamilyId: null,
      }))).not.toThrow();
    }
  });

  it('permits up to 16 family levels and rejects a longer route', () => {
    const families = Array.from({ length: 17 }, () => randomUUID());
    const route = families.map((familyId, index) => familyRow(
      familyId, index ? families[index - 1] : null,
    ));
    expect(() => check(...route.slice(0, 16))).not.toThrow();
    expect(() => check(...route)).toThrow('16 niveles');
  });

  it('accepts optional UUID/null route parents and rejects an asset description as an HTTP parent', async () => {
    const parentFamilyId = randomUUID();
    for (const templateParentFamilyId of [undefined, null, parentFamilyId]) {
      const dto = plainToInstance(EquipmentConfigurationDto, {
        version: 0, entries: [familyRow(randomUUID(), templateParentFamilyId)],
      });
      expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
    }
    const invalid = plainToInstance(EquipmentConfigurationDto, {
      version: 0, entries: [{ ...familyRow(randomUUID()), templateParentFamilyId: 'Compresor #1' }],
    });
    expect((await validate(invalid, { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
  });
});
