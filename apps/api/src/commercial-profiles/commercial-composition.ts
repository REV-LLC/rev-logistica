import type {
  CommercialSnapshot,
  CompositionPart,
} from './commercial-profile.input';
import { resolveCommercialMode } from './commercial-resolver';

export type CommercialNode = {
  id: string;
  parentId?: string;
  assetId?: string;
  skuId?: string;
  accessoryId?: string;
  familyId?: string;
  label: string;
  quantity: number;
  snapshot: CommercialSnapshot;
};

/** Resolve a historical physical graph against frozen rules, never today's inventory recipe. */
export function resolveComposition(
  nodes: CommercialNode[],
): Map<string, CommercialSnapshot> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const resolved = new Map<string, CommercialSnapshot>();
  const resolving = new Set<string>();
  const resolve = (id: string): CommercialSnapshot => {
    const cached = resolved.get(id);
    if (cached) return cached;
    const node = byId.get(id)!;
    if (resolving.has(id))
      return {
        status: 'REVIEW',
        schemaVersion: 2,
        reason: 'Relación de conjunto cíclica',
        parts: [],
      };
    resolving.add(id);
    const parts: CompositionPart[] = nodes
      .filter((child) => child.parentId === id && child.quantity > 0)
      .map((child) => ({
        documentItemId: child.id,
        parentDocumentItemId: id,
        ...(node.assetId ? { parentAssetId: node.assetId } : {}),
        ...(child.assetId ? { assetId: child.assetId } : {}),
        ...(child.skuId ? { skuId: child.skuId } : {}),
        ...(child.accessoryId ? { accessoryId: child.accessoryId } : {}),
        ...(child.familyId ? { familyId: child.familyId } : {}),
        label: child.label,
        quantity: child.quantity,
      }));
    const frozen = node.snapshot;
    let snapshot: CommercialSnapshot =
      frozen.frozenProfile && frozen.catalog
        ? {
            ...resolveCommercialMode(
              frozen.frozenProfile,
              parts,
              frozen.catalog,
            ),
            schemaVersion: 2,
            frozenProfile: frozen.frozenProfile,
            catalog: frozen.catalog,
          }
        : {
            ...frozen,
            contextualZero: false,
            status: 'REVIEW',
            reason:
              'No existe modalidad comercial congelada para este elemento',
            parts: parts.map((p) => ({ ...p, treatment: 'REVIEW' })),
          };
    if (node.parentId && byId.has(node.parentId)) {
      const parent = resolve(node.parentId);
      const part = parent.parts.find((p) => p.documentItemId === node.id);
      snapshot.parentDocumentItemId = node.parentId;
      if (parent.status === 'RESOLVED' && part?.treatment === 'INCLUDED') {
        // Presence has an explicit zero price. It does not invent usage or alter the element's own tariff.
        snapshot = {
          ...snapshot,
          status: 'RESOLVED',
          contextualZero: true,
          basePrice: '0.00',
          reason: undefined,
          mode: {
            id: '00000000-0000-4000-8000-000000000000',
            name: 'Tarifa cero en este conjunto',
            unit: 'DAY',
            minimum: { value: '0', basis: 'PER_RENTAL' },
            pricing: { source: 'FIXED', amount: '0.00' },
            conditions: [],
            parts: [],
          },
        };
      } else if (
        !part ||
        part.treatment !== 'INDEPENDENT' ||
        parent.status !== 'RESOLVED'
      ) {
        snapshot = {
          ...snapshot,
          status: 'REVIEW',
          reason:
            'Falta definir la tarifa contextual de esta pieza en su conjunto',
        };
      }
    }
    resolving.delete(id);
    resolved.set(id, snapshot);
    return snapshot;
  };
  for (const node of nodes) resolve(node.id);
  return resolved;
}
