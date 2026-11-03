import type { AnnexInput } from './annex-input';
import type { CommercialDocument } from '../commercial-profiles/commercial-history-v2';
import type { CommercialSnapshot } from '../commercial-profiles/commercial-profile.input';
import type { SourceIssue } from './annex-inventory';

type Rental = AnnexInput['rentals'][number];
// Only absent commercial metadata is recoverable from a plain daily catalog item.
// An ambiguous combination, explicit agreement or inventory inconsistency is not.
const missingConditions = new Set([
  'No hay vínculo único entre el saldo y un ítem de remisión confirmado',
  'No existe modalidad comercial vigente para la entrega',
  'No existe modalidad comercial congelada para este elemento',
]);
const hasConditions = (s?: CommercialSnapshot | null) =>
  Boolean(
    s &&
    ((s.catalog && s.catalog.unit !== 'DAY') ||
      s.mode ||
      s.frozenProfile ||
      s.profileId ||
      s.selectedModeId ||
      s.minimumReview ||
      s.contextualZero ||
      s.parentDocumentItemId ||
      s.parts?.length),
  );

export function restoreStandaloneDailyCatalog(
  physical: Rental[],
  catalogUnits: Map<string, string>,
  documents: CommercialDocument[],
  commercial: {
    rentals: Rental[];
    machineDays: AnnexInput['machineDays'];
    issues: SourceIssue[];
  },
) {
  const items = documents.flatMap((d) => d.items);
  const restored = new Map<string, Rental>();
  const removedReferences = new Set<string>();
  for (const lot of physical) {
    if (
      catalogUnits.get(lot.source.reference) !== 'DAY' ||
      lot.accessoryId ||
      lot.includedIn
    )
      continue;
    const candidates = commercial.rentals.filter(
      (r) => r.source.reference === lot.source.reference,
    );
    if (
      !candidates.length ||
      candidates.some(
        (r) =>
          r.commercial?.status !== 'REVIEW' ||
          !missingConditions.has(r.commercial.reason ?? '') ||
          hasConditions(r.commercial),
      )
    )
      continue;
    // Check all documentary relationships, including children delivered later.
    const matching = items.filter((i) =>
      lot.assetId
        ? i.assetId === lot.assetId
        : !i.assetId && i.skuId === lot.skuId,
    );
    if (
      matching.some(
        (i) =>
          i.accessoryId ||
          i.parentCompositionNodeId ||
          i.parentSourceDocumentItemId ||
          i.parentLegacyOriginId ||
          i.componentParentAssetId ||
          hasConditions(i.commercialSnapshot as CommercialSnapshot | null) ||
          items.some(
            (child) =>
              child.parentSourceDocumentItemId === i.id ||
              (i.compositionNodeId &&
                child.documentId === i.documentId &&
                child.parentCompositionNodeId === i.compositionNodeId) ||
              (i.assetId && child.componentParentAssetId === i.assetId),
          ),
      )
    )
      continue;
    restored.set(lot.source.reference, lot);
    candidates.forEach((r) => removedReferences.add(r.id));
  }
  return {
    ...commercial,
    rentals: [
      ...commercial.rentals.filter((r) => !restored.has(r.source.reference)),
      ...restored.values(),
    ],
    issues: commercial.issues.filter(
      (i) =>
        !removedReferences.has(i.reference) ||
        !['COMMERCIAL_REVIEW', 'COMMERCIAL_HISTORY_REVIEW'].includes(i.code),
    ),
  };
}
