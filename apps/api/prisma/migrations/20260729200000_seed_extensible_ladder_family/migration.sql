INSERT INTO "AssetFamily" (
  "id",
  "code",
  "name",
  "controlType",
  "createdAt"
)
VALUES (
  gen_random_uuid()::text,
  'ESCALERA',
  'ESCALERA',
  'SERIAL',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "controlType" = 'SERIAL';

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
  'EXTENSIBLE',
  'EXTENSIBLE',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "AssetFamily" family
WHERE family."code" = 'ESCALERA'
ON CONFLICT ("assetFamilyId", "code") DO UPDATE
SET "name" = EXCLUDED."name",
    "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP;
