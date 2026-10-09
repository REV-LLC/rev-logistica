import type { ConfigurationEntry } from './types';

export type TemplateRouteEntry = ConfigurationEntry & {
  templateParentFamilyId?: string | null;
};

export type TemplateRouteNode = {
  entry: TemplateRouteEntry;
  children: TemplateRouteNode[];
};

export type TemplateRouteIssue = {
  familyId: string;
  reason: 'duplicate' | 'missing-parent' | 'cycle';
};

/** Family links describe recommendations only; array order never creates an edge. */
export function buildImplementTemplateRoute(entries: TemplateRouteEntry[]) {
  const families = entries.filter((entry) => !!entry.familyId);
  const byFamily = new Map<string, TemplateRouteEntry>();
  const duplicateFamilies = new Set<string>();
  for (const entry of families) {
    if (byFamily.has(entry.familyId!)) duplicateFamilies.add(entry.familyId!);
    else byFamily.set(entry.familyId!, entry);
  }

  const invalidFamilies = new Map<string, TemplateRouteIssue['reason']>();
  for (const entry of families) {
    const familyId = entry.familyId!;
    if (duplicateFamilies.has(familyId)) {
      invalidFamilies.set(familyId, 'duplicate');
      continue;
    }
    const visited = new Set<string>();
    let current: string | null = familyId;
    // Each step visits a different stored family or reports a cycle/missing link.
    while (current !== null && visited.size <= byFamily.size) {
      if (visited.has(current)) {
        invalidFamilies.set(familyId, 'cycle');
        break;
      }
      const next = byFamily.get(current);
      if (!next || duplicateFamilies.has(current)) {
        invalidFamilies.set(familyId, 'missing-parent');
        break;
      }
      visited.add(current);
      current = next.templateParentFamilyId ?? null;
    }
  }

  const nodes = new Map<string, TemplateRouteNode>();
  for (const entry of families) {
    if (!invalidFamilies.has(entry.familyId!)) nodes.set(entry.familyId!, { entry, children: [] });
  }
  const roots: TemplateRouteNode[] = [];
  for (const node of nodes.values()) {
    const parentId = node.entry.templateParentFamilyId;
    if (parentId == null) roots.push(node);
    else nodes.get(parentId)!.children.push(node);
  }
  return {
    roots,
    invalidEntries: families.filter((entry) => invalidFamilies.has(entry.familyId!)),
    issues: Array.from(invalidFamilies, ([familyId, reason]) => ({ familyId, reason })),
  };
}
