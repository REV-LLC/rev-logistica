ALTER TABLE "AssetFamilyComponent" ADD COLUMN "exclusiveGroup" TEXT;

-- A named group represents optional alternatives, at most one per parent asset.
ALTER TABLE "AssetFamilyComponent" ADD CONSTRAINT "exclusive_component_quantities"
CHECK ("exclusiveGroup" IS NULL OR (
  length(trim("exclusiveGroup")) > 0 AND NOT "required"
  AND "minimumQuantity" = 0 AND "maximumQuantity" IS NOT NULL AND "maximumQuantity" = 1
));

-- Do not relabel existing generic buckets or change ownership/stock.
INSERT INTO "AssetFamily" ("id", "code", "name", "controlType")
VALUES
  (gen_random_uuid()::text, 'BALDE_PARA_MINICARGADOR', 'BALDES PARA MINICARGADOR', 'SERIAL'),
  (gen_random_uuid()::text, 'MARTILLO_HIDRAULICO_PARA_MINICARGADOR', 'MARTILLOS HIDRÁULICOS PARA MINICARGADOR', 'SERIAL'),
  (gen_random_uuid()::text, 'UNAS_ESTIBADORAS_PARA_MINICARGADOR', 'JUEGOS DE UÑAS ESTIBADORAS PARA MINICARGADOR', 'SERIAL'),
  (gen_random_uuid()::text, 'BALDE_PARA_RETROEXCAVADORA', 'BALDES PARA RETROEXCAVADORA', 'SERIAL')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "AssetSubfamily" ("id", "assetFamilyId", "code", "name", "updatedAt")
SELECT gen_random_uuid()::text, id, 'ESTANDAR', 'ESTÁNDAR', CURRENT_TIMESTAMP
FROM "AssetFamily"
WHERE code IN ('BALDE_PARA_MINICARGADOR', 'MARTILLO_HIDRAULICO_PARA_MINICARGADOR',
  'UNAS_ESTIBADORAS_PARA_MINICARGADOR', 'BALDE_PARA_RETROEXCAVADORA')
ON CONFLICT ("assetFamilyId", "code") DO NOTHING;

WITH configured(parent_identity, component_code, group_name, sort_order) AS (
  VALUES
    ('MINICARGADOR', 'BALDE_PARA_MINICARGADOR', 'IMPLEMENTO FRONTAL', 10),
    ('MINICARGADOR', 'MARTILLO_HIDRAULICO_PARA_MINICARGADOR', 'IMPLEMENTO FRONTAL', 20),
    ('MINICARGADOR', 'UNAS_ESTIBADORAS_PARA_MINICARGADOR', 'IMPLEMENTO FRONTAL', 30),
    ('RETROEXCAVADORA', 'BALDE_PARA_RETROEXCAVADORA', 'BALDE', 10)
)
INSERT INTO "AssetFamilyComponent"
  ("id", "parentAssetFamilyId", "componentAssetFamilyId", "maximumQuantity",
   "exclusiveGroup", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, parent.id, component.id, 1,
  configured.group_name, configured.sort_order, CURRENT_TIMESTAMP
FROM configured
JOIN "AssetFamily" parent ON parent."controlType" = 'SERIAL' AND (
  regexp_replace(upper(parent.name), '[^A-Z0-9]', '', 'g') = configured.parent_identity
  OR regexp_replace(upper(parent.code), '[^A-Z0-9]', '', 'g') = configured.parent_identity
)
JOIN "AssetFamily" component ON component.code = configured.component_code
ON CONFLICT ("parentAssetFamilyId", "componentAssetFamilyId") DO NOTHING;
