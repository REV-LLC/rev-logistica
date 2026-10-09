BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('equipment-configuration', 0));
CREATE TABLE "RetiredMotorConfiguration" (
  "assetId" TEXT PRIMARY KEY REFERENCES "Asset"(id) ON DELETE RESTRICT,
  snapshot JSONB NOT NULL,
  "retiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "RetiredMotorConfiguration" ("assetId", snapshot)
SELECT a.id, jsonb_build_object(
  'motorConfiguration', a."motorConfiguration", 'assignedMotorId', a."assignedMotorId",
  'motorVersion', a."motorVersion",
  'compatibilities', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM "AssetMotorCompatibility" c
    WHERE c."motorAssetId" = a.id OR c."equipmentAssetId" = a.id), '[]'::jsonb))
FROM "Asset" a
WHERE a."motorConfiguration" <> 'NONE' OR a."assignedMotorId" IS NOT NULL OR
  EXISTS (SELECT 1 FROM "AssetMotorCompatibility" c WHERE c."motorAssetId" = a.id OR c."equipmentAssetId" = a.id);
-- Live links are retired only after their complete evidence has been saved.
UPDATE "Asset" SET "assignedMotorId" = NULL, "motorConfiguration" = 'NONE'
WHERE id IN (SELECT "assetId" FROM "RetiredMotorConfiguration");
DELETE FROM "AssetMotorCompatibility" c
WHERE EXISTS (SELECT 1 FROM "RetiredMotorConfiguration" r WHERE r."assetId" = c."motorAssetId")
  AND EXISTS (SELECT 1 FROM "RetiredMotorConfiguration" r WHERE r."assetId" = c."equipmentAssetId");
CREATE FUNCTION prevent_retired_motor_configuration_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'La configuración retirada del motor es histórica e inmutable.'; END;
$$;
CREATE TRIGGER "RetiredMotorConfiguration_immutable" BEFORE UPDATE OR DELETE ON "RetiredMotorConfiguration"
FOR EACH ROW EXECUTE FUNCTION prevent_retired_motor_configuration_change();
COMMIT;
