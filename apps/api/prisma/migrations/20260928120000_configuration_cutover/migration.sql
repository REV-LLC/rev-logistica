-- Authorized handoff of the retired configurator. Preserve identity and history;
-- compatibility is an optional choice, not physical assignment or default stock.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
SELECT pg_advisory_xact_lock(hashtextextended('equipment-configuration', 0));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "AssetFamilyComponent" r
    JOIN "AssetFamily" f ON f.id = r."componentAssetFamilyId"
    WHERE r.active AND (f.code NOT IN (
      'MOTOR_PARA_MEZCLADORA', 'ACCESORIOS_PARA_COMPRESOR', 'MARTILLO_NEUMATICO',
      'PUNTAS_PARA_DEMOLEDOR', 'BALDE_PARA_MINICARGADOR',
      'UNAS_ESTIBADORAS_PARA_MINICARGADOR', 'MARTILLO_HIDRAULICO_PARA_MINICARGADOR',
      'BALDE_PARA_RETROEXCAVADORA'
    ) OR r."minimumQuantity" < 0 OR r."maximumQuantity" < GREATEST(1, r."minimumQuantity"))
  ) THEN
    RAISE EXCEPTION 'Unreviewed legacy family rule. Review classification/limits before cutover.';
  END IF;
END $$;

INSERT INTO "EquipmentConfigurationArchive" (id, source, payload)
SELECT 'family-rule:' || id, 'AssetFamilyComponent', to_jsonb(r)
FROM "AssetFamilyComponent" r ON CONFLICT (id) DO NOTHING;
INSERT INTO "EquipmentConfigurationArchive" (id, source, payload)
SELECT 'motor:' || id, 'AssetMotorAssociation',
  jsonb_build_object('assetId', id, 'motorConfiguration', "motorConfiguration", 'assignedMotorId', "assignedMotorId")
FROM "Asset" WHERE "motorConfiguration" <> 'NONE' OR "assignedMotorId" IS NOT NULL
ON CONFLICT (id) DO NOTHING;
INSERT INTO "EquipmentConfigurationArchive" (id, source, payload)
SELECT 'accessory-link:' || "accessoryId" || ':' || "assetId", 'AccessoryAsset', to_jsonb(link)
FROM "AccessoryAsset" link ON CONFLICT (id) DO NOTHING;

-- Never overwrite a configuration already edited in the new system.
CREATE TEMP TABLE configuration_cutover_assets (id TEXT PRIMARY KEY) ON COMMIT DROP;
WITH created AS (
  INSERT INTO "EquipmentConfiguration" (id, "assetId", version, notes, "updatedAt")
  SELECT gen_random_uuid()::text, a.id, 1,
    CASE WHEN a."motorConfiguration" = 'FIXED' THEN
      'Motor fijo integrado. No requiere un motor separado en el documento.' END,
    CURRENT_TIMESTAMP
  FROM "Asset" a JOIN "Sku" s ON s.id = a."skuId"
  WHERE a.active AND a."deletedAt" IS NULL AND (
    a."motorConfiguration" <> 'NONE' OR a."assignedMotorId" IS NOT NULL OR
    EXISTS (SELECT 1 FROM "AssetFamilyComponent" r WHERE r.active AND r."parentAssetFamilyId" = s."assetFamilyId") OR
    EXISTS (SELECT 1 FROM "AccessoryAsset" link JOIN "Accessory" part ON part.id = link."accessoryId"
      WHERE link."assetId" = a.id AND part.active AND part.scope = 'ASSETS' AND part."familyId" = s."assetFamilyId")
  )
  ON CONFLICT ("assetId") DO NOTHING RETURNING id
)
INSERT INTO configuration_cutover_assets SELECT id FROM created;

INSERT INTO "EquipmentConfigurationEntry" (
  id, "configurationId", role, "familyId", quantity, "maximumQuantity", "defaultIncluded", required, "sortOrder"
)
SELECT gen_random_uuid()::text, c.id, 'ACCESSORY', r."componentAssetFamilyId",
  GREATEST(1, r."minimumQuantity"), r."maximumQuantity", false,
  r.required OR r."minimumQuantity" > 0, r."sortOrder"
FROM configuration_cutover_assets created
JOIN "EquipmentConfiguration" c ON c.id = created.id
JOIN "Asset" a ON a.id = c."assetId" JOIN "Sku" s ON s.id = a."skuId"
JOIN "AssetFamilyComponent" r ON r."parentAssetFamilyId" = s."assetFamilyId" AND r.active
JOIN "AssetFamily" f ON f.id = r."componentAssetFamilyId"
WHERE f.code <> 'MOTOR_PARA_MEZCLADORA';
-- Motors remain on Asset.assignedMotorId. Exclusive groups stay in the archive,
-- not the document validator: balde and uñas may travel together.
INSERT INTO "EquipmentConfigurationEntry" (
  id, "configurationId", role, "accessoryId", quantity, "defaultIncluded", required, "sortOrder"
)
SELECT gen_random_uuid()::text, c.id, part.purpose, part.id, 1, false, false, 100
FROM configuration_cutover_assets created
JOIN "EquipmentConfiguration" c ON c.id = created.id
JOIN "Asset" a ON a.id = c."assetId" JOIN "Sku" s ON s.id = a."skuId"
JOIN "AccessoryAsset" link ON link."assetId" = a.id
JOIN "Accessory" part ON part.id = link."accessoryId"
WHERE part.active AND part.scope = 'ASSETS' AND part."familyId" = s."assetFamilyId";

INSERT INTO "EquipmentConfigurationRevision" (id, "configurationId", before, after, "createdBy")
SELECT gen_random_uuid()::text, c.id, '{"source":"LegacyConfigurationHandoff"}'::jsonb,
  to_jsonb(c) || jsonb_build_object('entries', COALESCE((
    SELECT jsonb_agg(to_jsonb(e) ORDER BY e."sortOrder", e.id)
    FROM "EquipmentConfigurationEntry" e WHERE e."configurationId" = c.id
  ), '[]'::jsonb)), 'CONFIGURATION-CUTOVER-20260928'
FROM "EquipmentConfiguration" c JOIN configuration_cutover_assets created ON created.id = c.id;
INSERT INTO "EquipmentConfigurationArchive" (id, source, payload)
SELECT 'converted:' || c."assetId", 'ConfigurationConversion',
  jsonb_build_object('configurationId', c.id, 'assetId', c."assetId")
FROM "EquipmentConfiguration" c JOIN configuration_cutover_assets created ON created.id = c.id
ON CONFLICT (id) DO NOTHING;
COMMIT;
