import {
  discoverLegacyAccessoryFamilies,
  normalizeLegacyCatalogCode,
  proposeLegacyDocumentParent,
} from './legacy-accessory-audit';

const family = (code: string, controlType = 'SERIAL') => ({
  id: code,
  code,
  name: code,
  controlType,
});
const rule = (component: string, overrides = {}) => ({
  id: `rule-${component}`,
  componentAssetFamilyId: component,
  parentAssetFamilyId: 'MINICARGADOR',
  active: true,
  required: false,
  minimumQuantity: 0,
  maximumQuantity: null,
  exclusiveGroup: null,
  ...overrides,
});

describe('legacy accessory discovery (never converts inventory)', () => {
  it('normalizes accents and whitespace without editing the source', () => {
    expect(normalizeLegacyCatalogCode('  Uñas Estibadoras ')).toBe(
      'UNAS_ESTIBADORAS',
    );
  });
  it('does not treat an ordinary machine or rotomartillo as an accessory', () => {
    expect(
      discoverLegacyAccessoryFamilies(
        [family('MINICARGADOR'), family('ROTOMARTILLO')],
        [],
      ),
    ).toEqual([]);
  });
  it('discovers explicit buckets and alternative implement rules without authorizing them', () => {
    const [result] = discoverLegacyAccessoryFamilies(
      [family('BALDE_PARA_MINICARGADOR')],
      [
        rule('BALDE_PARA_MINICARGADOR', {
          maximumQuantity: 1,
          exclusiveGroup: 'IMPLEMENTO FRONTAL',
        }),
      ],
    );
    expect(result.recordedParentFamilyIds).toEqual(['MINICARGADOR']);
    expect(result.blockers).toContain('PRESERVE_COMPONENT_QUANTITY_RULES');
    expect(result.conversionAuthorized).toBe(false);
  });
  it('does not equate BULK with consumable, even for a family called accessories', () => {
    const [result] = discoverLegacyAccessoryFamilies(
      [family('ACCESORIOS_DE_SOLDADURA', 'BULK')],
      [],
    );
    expect(result.blockers).toEqual([
      'CONFIRM_KIND_AND_UNIT_IDENTITY',
      'CONFIRM_COMPATIBILITY',
    ]);
  });
  it('preserves the specialized motor and APT workflows despite component relations', () => {
    const results = discoverLegacyAccessoryFamilies(
      [family('MOTOR_PARA_MEZCLADORA'), family('MARTILLO_NEUMATICO')],
      [rule('MOTOR_PARA_MEZCLADORA'), rule('MARTILLO_NEUMATICO')],
    );
    expect(
      results.every(
        (result) => result.disposition === 'PRESERVE_SPECIALIZED_EQUIPMENT',
      ),
    ).toBe(true);
  });
  it('ignores inactive compatibility and flags multiple active parent families', () => {
    const [result] = discoverLegacyAccessoryFamilies(
      [family('CANASTA')],
      [
        rule('CANASTA'),
        rule('CANASTA', { id: 'r2', parentAssetFamilyId: 'PLUMA_GRUA' }),
        rule('CANASTA', {
          id: 'r3',
          parentAssetFamilyId: 'EXCAVADORA',
          active: false,
        }),
      ],
    );
    expect(result.recordedParentFamilyIds).toEqual([
      'MINICARGADOR',
      'PLUMA_GRUA',
    ]);
    expect(result.blockers).toContain('MULTIPLE_PARENT_FAMILIES');
  });
});

describe('documentary parent proposals', () => {
  const mini = { id: 'mini', publicCode: 'MINI-1', familyId: 'MINICARGADOR' };
  const base = {
    recordedParent: null,
    compatibleFamilyIds: ['MINICARGADOR'],
    documentAssets: [mini],
  };
  it('does not silently turn one co-occurring machine into an assignment', () => {
    expect(proposeLegacyDocumentParent(base)).toEqual({
      status: 'PROPOSED_PARENT_NOT_CONFIRMED',
      parent: null,
      candidates: [mini],
    });
  });
  it('preserves an explicitly recorded relationship', () => {
    expect(
      proposeLegacyDocumentParent({ ...base, recordedParent: mini }).status,
    ).toBe('RECORDED_PARENT');
  });
  it('flags a recorded parent outside the current configured family', () => {
    expect(
      proposeLegacyDocumentParent({
        ...base,
        compatibleFamilyIds: [],
        recordedParent: mini,
      }).status,
    ).toBe('RECORDED_PARENT_REQUIRES_REVIEW');
  });
  it('flags multiple possible machines and never picks the first', () => {
    expect(
      proposeLegacyDocumentParent({
        ...base,
        documentAssets: [mini, { ...mini, id: 'mini2' }],
      }).status,
    ).toBe('AMBIGUOUS_PARENT');
  });
  it('deduplicates repeated rows for one machine', () => {
    expect(
      proposeLegacyDocumentParent({ ...base, documentAssets: [mini, mini] })
        .candidates,
    ).toEqual([mini]);
  });
  it('excludes the accessory itself and does not invent a parent for an accessory-only document', () => {
    expect(
      proposeLegacyDocumentParent({ ...base, accessoryAssetId: mini.id })
        .status,
    ).toBe('MISSING_PARENT');
    expect(
      proposeLegacyDocumentParent({ ...base, documentAssets: [] }).status,
    ).toBe('MISSING_PARENT');
  });
});
