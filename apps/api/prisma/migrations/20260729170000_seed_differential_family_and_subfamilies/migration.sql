INSERT INTO "AssetFamily" (
  "id",
  "code",
  "name",
  "controlType",
  "createdAt"
)
VALUES (
  gen_random_uuid()::text,
  'DIFERENCIAL',
  'DIFERENCIAL',
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
  values_to_seed."code",
  values_to_seed."name",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "AssetFamily" family
CROSS JOIN (
  VALUES
    ('1_TONELADA', '1 TONELADA'),
    ('5_TONELADAS', '5 TONELADAS')
) AS values_to_seed("code", "name")
WHERE family."code" = 'DIFERENCIAL'
ON CONFLICT ("assetFamilyId", "code") DO UPDATE
SET "name" = EXCLUDED."name",
    "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP;
