-- The existing catalog groups compressor hoses under ACCESORIOS PARA COMPRESOR
-- and identifies Brute equipment through the DEMOLEDOR family.
INSERT INTO "AssetFamily" ("id", "code", "name", "controlType", "createdAt")
VALUES (
  gen_random_uuid()::text,
  'PUNTAS_PARA_DEMOLEDOR',
  'PUNTAS PARA DEMOLEDOR',
  'BULK',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

DELETE FROM "AssetFamilyComponent" rule
USING "AssetFamily" parent, "AssetFamily" component
WHERE rule."parentAssetFamilyId" = parent.id
  AND rule."componentAssetFamilyId" = component.id
  AND parent.code = 'ACCESORIOS_PARA_COMPRESOR'
  AND component.code = 'MARTILLO_NEUMATICO';

WITH configured(parent_code, component_code, sort_order) AS (
  VALUES
    ('COMPRESOR', 'ACCESORIOS_PARA_COMPRESOR', 10),
    ('COMPRESOR', 'MARTILLO_NEUMATICO', 20),
    ('DEMOLEDOR', 'PUNTAS_PARA_DEMOLEDOR', 10),
    ('MEZCLADORA', 'MOTOR_PARA_MEZCLADORA', 10)
)
INSERT INTO "AssetFamilyComponent" (
  "id", "parentAssetFamilyId", "componentAssetFamilyId", "sortOrder", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  parent.id,
  component.id,
  configured.sort_order,
  CURRENT_TIMESTAMP
FROM configured
JOIN "AssetFamily" parent ON parent.code = configured.parent_code
JOIN "AssetFamily" component ON component.code = configured.component_code
ON CONFLICT ("parentAssetFamilyId", "componentAssetFamilyId")
DO UPDATE SET
  "sortOrder" = EXCLUDED."sortOrder",
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
