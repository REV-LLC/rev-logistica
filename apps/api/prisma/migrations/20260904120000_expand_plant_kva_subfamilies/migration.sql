-- Ensure the serialized plant family exists before seeding its capacity catalog.
INSERT INTO "AssetFamily" (
  "id",
  "code",
  "name",
  "controlType",
  "createdAt"
)
VALUES (
  gen_random_uuid()::text,
  'PLANTA_ELECTRICA',
  'PLANTA ELÉCTRICA',
  'SERIAL',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

-- KVA capacities from 3 to 10 in increments of 0.5. Existing values are
-- reactivated and normalized without changing their identifiers.
WITH requested("code", "name") AS (
  VALUES
    ('3_KVA', '3 KVA'),
    ('3_5_KVA', '3.5 KVA'),
    ('4_KVA', '4 KVA'),
    ('4_5_KVA', '4.5 KVA'),
    ('5_KVA', '5 KVA'),
    ('5_5_KVA', '5.5 KVA'),
    ('6_KVA', '6 KVA'),
    ('6_5_KVA', '6.5 KVA'),
    ('7_KVA', '7 KVA'),
    ('7_5_KVA', '7.5 KVA'),
    ('8_KVA', '8 KVA'),
    ('8_5_KVA', '8.5 KVA'),
    ('9_KVA', '9 KVA'),
    ('9_5_KVA', '9.5 KVA'),
    ('10_KVA', '10 KVA')
), plant_family AS (
  SELECT "id"
  FROM "AssetFamily"
  WHERE "code" = 'PLANTA_ELECTRICA'
), normalized AS (
  UPDATE "AssetSubfamily" AS subfamily
  SET "active" = true,
      "updatedAt" = CURRENT_TIMESTAMP
  FROM plant_family AS family, requested
  WHERE subfamily."assetFamilyId" = family."id"
    AND (subfamily."code" = requested."code" OR subfamily."name" = requested."name")
  RETURNING subfamily."id"
)
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
FROM plant_family AS family
CROSS JOIN requested
WHERE NOT EXISTS (
  SELECT 1
  FROM "AssetSubfamily" AS existing
  WHERE existing."assetFamilyId" = family."id"
    AND (existing."code" = requested."code" OR existing."name" = requested."name")
)
ON CONFLICT DO NOTHING;
