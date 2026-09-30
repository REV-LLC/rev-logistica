import type {
  CommercialGroup,
  CommercialMode,
  CompositionPart,
  CommercialSnapshot,
} from './commercial-profile.input';
export function matchesGroup(group: CommercialGroup, part: CompositionPart) {
  return group.selectors.some(
    (s) =>
      ({
        ASSET: part.assetId,
        SKU: part.skuId,
        FAMILY: part.familyId,
        ACCESSORY: part.accessoryId,
      })[s.kind] === s.id,
  );
}
export function resolveCommercialMode(
  profile: {
    id: string;
    version: number;
    effectiveFrom: string;
    groups: CommercialGroup[];
    modes: CommercialMode[];
  },
  parts: CompositionPart[],
  catalog: { unit: string; price: string },
): CommercialSnapshot {
  const groups = new Map(profile.groups.map((g) => [g.id, g]));
  const matching = profile.modes.filter((mode) =>
    mode.conditions.every((condition) => {
      const group = groups.get(condition.groupId);
      if (!group) return false;
      const quantity = parts
        .filter((p) => matchesGroup(group, p))
        .reduce((sum, p) => sum + p.quantity, 0);
      return condition.presence === 'ABSENT'
        ? quantity === 0
        : quantity >= (condition.minimumQuantity ?? 1);
    }),
  );
  const base = {
    profileId: profile.id,
    version: profile.version,
    effectiveFrom: profile.effectiveFrom,
  };
  const review = (reason: string): CommercialSnapshot => ({
    ...base,
    status: 'REVIEW',
    reason,
    parts: parts.map((p) => ({ ...p, treatment: 'REVIEW' })),
  });
  if (matching.length !== 1)
    return review(
      matching.length
        ? 'Varias modalidades coinciden con el conjunto'
        : 'No hay modalidad aplicable al conjunto',
    );
  const mode = matching[0];
  if (mode.pricing.source === 'CATALOG' && mode.unit !== catalog.unit)
    return review(
      'La unidad de la tarifa del catálogo no coincide con la modalidad',
    );
  const resolved = parts.map((part) => {
    const treatments = new Set(
      mode.parts
        .filter((rule) => {
          const group = groups.get(rule.groupId);
          return group && matchesGroup(group, part);
        })
        .map((r) => r.treatment),
    );
    return {
      ...part,
      treatment:
        treatments.size === 1 ? [...treatments][0] : ('REVIEW' as const),
    };
  });
  if (resolved.some((p) => p.treatment === 'REVIEW'))
    return review(
      'Define si cada pieza está incluida o se cobra independientemente',
    );
  return {
    ...base,
    status: 'RESOLVED',
    mode,
    basePrice:
      mode.pricing.source === 'FIXED' ? mode.pricing.amount : catalog.price,
    parts: resolved,
  };
}
