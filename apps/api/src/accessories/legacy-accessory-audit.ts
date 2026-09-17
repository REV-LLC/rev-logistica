/** Discovery only: a family name or a component rule never authorizes conversion. */
export type LegacyFamily = {
  id: string;
  code: string;
  name: string;
  controlType: string;
};

export type LegacyComponentRule = {
  id: string;
  parentAssetFamilyId: string;
  componentAssetFamilyId: string;
  active: boolean;
  required: boolean;
  minimumQuantity: number;
  maximumQuantity: number | null;
  exclusiveGroup: string | null;
};

export function normalizeLegacyCatalogCode(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

export function discoverLegacyAccessoryFamilies(
  families: readonly LegacyFamily[],
  rules: readonly LegacyComponentRule[],
) {
  return families
    .flatMap((family) => {
      const code = normalizeLegacyCatalogCode(family.code);
      const name = normalizeLegacyCatalogCode(family.name);
      const componentRules = rules.filter(
        (rule) => rule.componentAssetFamilyId === family.id,
      );
      const nameMatch = [code, name].some(
        (value) =>
          /(^|_)(ACCESORIOS?|BALDES?|PUNTAS?|CANASTAS?|UNAS)(_|$)/.test(
            value,
          ) || value === 'MARTILLO_HIDRAULICO',
      );
      if (!nameMatch && componentRules.length === 0) return [];

      // An APT can accompany a compressor and still be equipment with its own tips.
      // Motors also have a dedicated assignment/lifecycle, not generic accessories.
      const preserveEquipment =
        code === 'MARTILLO_NEUMATICO' || code === 'MOTOR_PARA_MEZCLADORA';
      const activeParentIds = [
        ...new Set(
          componentRules
            .filter((rule) => rule.active)
            .map((rule) => rule.parentAssetFamilyId),
        ),
      ].sort();
      const blockers: string[] = [];
      if (!preserveEquipment) {
        if (family.controlType === 'BULK')
          blockers.push('CONFIRM_KIND_AND_UNIT_IDENTITY');
        if (activeParentIds.length === 0)
          blockers.push('CONFIRM_COMPATIBILITY');
        if (activeParentIds.length > 1)
          blockers.push('MULTIPLE_PARENT_FAMILIES');
        if (
          componentRules.some(
            (rule) =>
              rule.active &&
              (rule.required ||
                rule.minimumQuantity > 0 ||
                rule.maximumQuantity !== null ||
                rule.exclusiveGroup),
          )
        )
          blockers.push('PRESERVE_COMPONENT_QUANTITY_RULES');
      }
      return [
        {
          ...family,
          normalizedCode: code,
          disposition: preserveEquipment
            ? 'PRESERVE_SPECIALIZED_EQUIPMENT'
            : 'REVIEW_ACCESSORY_CONVERSION',
          reasons: [
            nameMatch ? 'CATALOG_NAME' : null,
            componentRules.length ? 'COMPONENT_RELATION' : null,
          ].filter((reason): reason is string => reason !== null),
          recordedParentFamilyIds: activeParentIds,
          componentRules,
          blockers,
          conversionAuthorized: false,
        },
      ];
    })
    .sort((a, b) => a.normalizedCode.localeCompare(b.normalizedCode));
}

type ParentCandidate = { id: string; familyId: string; publicCode: string };

/** A co-occurring machine is a proposal, never an inferred historical assignment. */
export function proposeLegacyDocumentParent(input: {
  recordedParent: ParentCandidate | null;
  compatibleFamilyIds: readonly string[];
  documentAssets: readonly ParentCandidate[];
  accessoryAssetId?: string | null;
}) {
  if (input.recordedParent) {
    const compatible = input.compatibleFamilyIds.includes(
      input.recordedParent.familyId,
    );
    return {
      status: compatible
        ? 'RECORDED_PARENT'
        : 'RECORDED_PARENT_REQUIRES_REVIEW',
      parent: input.recordedParent,
      candidates: [] as ParentCandidate[],
    };
  }
  const candidates = [
    ...new Map(
      input.documentAssets
        .filter(
          (asset) =>
            asset.id !== input.accessoryAssetId &&
            input.compatibleFamilyIds.includes(asset.familyId),
        )
        .map((asset) => [asset.id, asset]),
    ).values(),
  ].sort((a, b) => a.id.localeCompare(b.id));
  return {
    status:
      candidates.length === 1
        ? 'PROPOSED_PARENT_NOT_CONFIRMED'
        : candidates.length > 1
          ? 'AMBIGUOUS_PARENT'
          : 'MISSING_PARENT',
    parent: null,
    candidates,
  };
}
