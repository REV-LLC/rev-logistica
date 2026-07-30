import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  normalizeMeasurementLabel,
  normalizeSkuReference,
} from '../src/inventory/catalog-reference-normalization';

type Mapping = Record<string, any>;
type CatalogMapping = {
  mappings: Mapping[];
  [key: string]: unknown;
};

const apply = process.argv.includes('--apply');
const reportArgumentIndex = process.argv.indexOf('--report-file');
const reportPath =
  reportArgumentIndex >= 0
    ? resolve(process.cwd(), process.argv[reportArgumentIndex + 1])
    : null;
const filePath = resolve(
  process.cwd(),
  'apps/api/data/catalog-mapping-final.json',
);

function isImportable(mapping: Mapping) {
  if (
    !['CONFIRMADO_BULK', 'CONFIRMADO_SERIAL'].includes(
      mapping.classificationStatus,
    )
  ) {
    return false;
  }
  const action = String(mapping.finalAction ?? '');
  return !action.startsWith('OMITIR') && !action.startsWith('NO_IMPORTAR');
}

function priority(mapping: Mapping) {
  return mapping.appearsInWarehouse
    ? 3
    : mapping.appearsOnSite
      ? 2
      : mapping.appearsInSupplierInventory
        ? 1
        : 0;
}

function normalizedKey(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function equivalenceKey(mapping: Mapping) {
  const size = normalizeMeasurementLabel(mapping.normalizedSize);
  const identity = size || normalizeSkuReference(mapping.finalSkuName, null);
  return [
    normalizedKey(mapping.normalizedFamily),
    normalizedKey(mapping.normalizedSubfamily),
    normalizedKey(identity),
    mapping.classificationStatus,
  ].join('|');
}

async function main() {
  const catalog = JSON.parse(
    await readFile(filePath, 'utf8'),
  ) as CatalogMapping;
  const priorReport =
    reportPath !== null
      ? await readFile(reportPath, 'utf8')
          .then((contents) => JSON.parse(contents))
          .catch(() => null)
      : null;
  const priorChangesByArticle = new Map<string, any>(
    (priorReport?.changes ?? []).map((change: any) => [
      String(change.articleCode),
      change,
    ]),
  );
  let namesChanged = 0;
  let sizesChanged = 0;
  const changes: Array<{
    articleCode: string;
    sourceName: string;
    previousName: string;
    canonicalName: string;
    previousSize: string | null;
    canonicalSize: string | null;
    sourcePriority: 'OWN_WAREHOUSE' | 'OWN_WORKSITE' | 'SUPPLIER';
  }> = [];

  for (const mapping of catalog.mappings) {
    if (!mapping.finalSkuName) continue;
    const priorChange = priorChangesByArticle.get(String(mapping.articleCode));
    const knownLegacyNames = [
      ...(mapping.legacySkuNames ?? []),
      priorChange?.previousName,
    ].filter(Boolean);
    if (knownLegacyNames.length) {
      mapping.legacySkuNames = [...new Set(knownLegacyNames)].filter(
        (name) => name !== mapping.finalSkuName,
      );
    }
    const previousName = mapping.finalSkuName;
    const previousSize = mapping.normalizedSize ?? null;
    const normalizedSize = normalizeMeasurementLabel(mapping.normalizedSize);
    const normalizedName = normalizeSkuReference(
      mapping.finalSkuName,
      normalizedSize,
    );
    if (mapping.finalSkuName !== normalizedName) {
      mapping.legacySkuNames = [
        ...new Set([...(mapping.legacySkuNames ?? []), previousName]),
      ];
      mapping.finalSkuName = normalizedName;
      namesChanged += 1;
    }
    if ((mapping.normalizedSize ?? null) !== normalizedSize) {
      mapping.normalizedSize = normalizedSize;
      sizesChanged += 1;
    }
    if (
      previousName !== mapping.finalSkuName ||
      previousSize !== (mapping.normalizedSize ?? null)
    ) {
      changes.push({
        articleCode: String(mapping.articleCode),
        sourceName: String(mapping.articleName ?? ''),
        previousName,
        canonicalName: mapping.finalSkuName,
        previousSize,
        canonicalSize: mapping.normalizedSize ?? null,
        sourcePriority: mapping.appearsInWarehouse
          ? 'OWN_WAREHOUSE'
          : mapping.appearsOnSite
            ? 'OWN_WORKSITE'
            : 'SUPPLIER',
      });
    }
  }

  const groups = new Map<string, Mapping[]>();
  for (const mapping of catalog.mappings.filter(isImportable)) {
    const key = equivalenceKey(mapping);
    const current = groups.get(key);
    if (current) current.push(mapping);
    else groups.set(key, [mapping]);
  }

  let referencesAligned = 0;
  const alignedGroups: Array<{
    canonicalName: string;
    articleCodes: string[];
    ownMaster: boolean;
  }> = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const master = [...group].sort((a, b) => priority(b) - priority(a))[0];
    let changed = false;
    for (const mapping of group) {
      if (mapping.finalSkuName !== master.finalSkuName) {
        mapping.finalSkuName = master.finalSkuName;
        referencesAligned += 1;
        changed = true;
      }
    }
    if (changed || group.length > 1) {
      alignedGroups.push({
        canonicalName: master.finalSkuName,
        articleCodes: group.map((mapping) => String(mapping.articleCode)),
        ownMaster: Boolean(master.appearsInWarehouse || master.appearsOnSite),
      });
    }
  }

  console.log({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    namesChanged,
    sizesChanged,
    referencesAligned,
    equivalenceGroups: groups.size,
    sharedReferenceGroups: alignedGroups.length,
    groupsUsingOwnMaster: alignedGroups.filter((group) => group.ownMaster)
      .length,
  });
  console.log(JSON.stringify(alignedGroups, null, 2));

  if (reportPath) {
    await writeFile(
      reportPath,
      `${JSON.stringify(
        {
          summary: {
            namesChanged,
            sizesChanged,
            referencesAligned,
            equivalenceGroups: groups.size,
            sharedReferenceGroups: alignedGroups.length,
          },
          changes,
          alignedGroups,
        },
        null,
        2,
      )}\n`,
    );
  }
  if (apply) {
    await writeFile(filePath, `${JSON.stringify(catalog, null, 2)}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
