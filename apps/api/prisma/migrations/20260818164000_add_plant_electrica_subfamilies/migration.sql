-- Keep generator capacity as the numbering subfamily for serialized plants.
INSERT INTO "AssetSubfamily" (
  "id",
  "assetFamilyId",
  "code",
  "name",
  "active",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  family."id",
  requested."code",
  requested."name",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "AssetFamily" AS family
CROSS JOIN (
  VALUES
    ('5_5_KVA', '5.5 KVA'),
    ('10_KVA', '10 KVA')
) AS requested("code", "name")
WHERE family."code" = 'PLANTA_ELECTRICA'
ON CONFLICT ("assetFamilyId", "code") DO UPDATE
SET "name" = EXCLUDED."name",
    "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP;

-- Correct existing references that had to use the former 8 KVA-only option.
UPDATE "Sku" AS sku
SET "assetSubfamilyId" = subfamily."id"
FROM "AssetFamily" AS family
JOIN "AssetSubfamily" AS subfamily
  ON subfamily."assetFamilyId" = family."id"
WHERE sku."assetFamilyId" = family."id"
  AND family."code" = 'PLANTA_ELECTRICA'
  AND subfamily."code" = '10_KVA'
  AND regexp_replace(replace(upper(sku."name"), ',', '.'), '\s+', '', 'g') LIKE '%10KVA%';

UPDATE "Sku" AS sku
SET "assetSubfamilyId" = subfamily."id"
FROM "AssetFamily" AS family
JOIN "AssetSubfamily" AS subfamily
  ON subfamily."assetFamilyId" = family."id"
WHERE sku."assetFamilyId" = family."id"
  AND family."code" = 'PLANTA_ELECTRICA'
  AND subfamily."code" = '5_5_KVA'
  AND regexp_replace(replace(upper(sku."name"), ',', '.'), '\s+', '', 'g') LIKE '%5.5KVA%';

-- If another environment already has assets on a corrected SKU, preserve the
-- next internal number for each owner in the new subfamily numbering series.
INSERT INTO "AssetInternalCounter" (
  "id",
  "ownerWarehouseId",
  "assetSubfamilyId",
  "nextNumber",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  asset."warehouseOwnerId",
  sku."assetSubfamilyId",
  MAX(asset."internalNumber") + 1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Asset" AS asset
JOIN "Sku" AS sku ON sku."id" = asset."skuId"
JOIN "AssetFamily" AS family ON family."id" = sku."assetFamilyId"
JOIN "AssetSubfamily" AS subfamily ON subfamily."id" = sku."assetSubfamilyId"
WHERE family."code" = 'PLANTA_ELECTRICA'
  AND subfamily."code" IN ('5_5_KVA', '10_KVA')
GROUP BY asset."warehouseOwnerId", sku."assetSubfamilyId"
ON CONFLICT ("ownerWarehouseId", "assetSubfamilyId") DO UPDATE
SET "nextNumber" = GREATEST(
      "AssetInternalCounter"."nextNumber",
      EXCLUDED."nextNumber"
    ),
    "updatedAt" = CURRENT_TIMESTAMP;
