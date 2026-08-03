-- The JCB 1CX shares the RETROEXCAVADORA family but has an independent MINI
-- numbering series.
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
  'MINI',
  'MINI',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "AssetFamily" family
WHERE family."controlType" = 'SERIAL'
  AND (
    family."code" IN ('REXC', 'RETROEXCAVADORA', 'RETRO_EXCAVADORA')
    OR upper(replace(family."name", ' ', '')) = 'RETROEXCAVADORA'
  )
ON CONFLICT ("assetFamilyId", "code") DO UPDATE
SET "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP;
