-- Reviewed against the 2026-10-06 production snapshot. Only catalogue metadata;
-- no units, kit recipes, documents, stock balances or ledger movements are created.
DO $$
DECLARE
  family_id TEXT;
  yoyo_subfamily_id TEXT;
  yoyo_id TEXT;
  current_subfamily_id TEXT;
BEGIN
  SELECT "id" INTO family_id FROM "AssetFamily"
    WHERE "id" = 'b3586941-283d-4b0d-a086-e0e1433a191c'
      AND "code" = 'ANDAMIO_COLGANTE' AND "controlType" = 'BULK';
  IF family_id IS NULL THEN RETURN; END IF;
  UPDATE "AssetFamily" SET "bulkKitsEnabled" = true,
    "bulkKitPrefix" = 'Andamio colgante de', "bulkKitSettingsVersion" = 1
    WHERE "id" = family_id AND "bulkKitSettingsVersion" = 0;
  SELECT "id" INTO yoyo_subfamily_id FROM "AssetSubfamily"
    WHERE "id" = '3b381c25-25b9-4b6b-9073-72cf71d70c21'
      AND "assetFamilyId" = family_id AND "code" = 'YOYO' AND "active" = true;
  SELECT "id", "assetSubfamilyId" INTO yoyo_id, current_subfamily_id FROM "Sku"
    WHERE "id" = 'd006a75a-be1a-461d-bd27-a8daac757c9b'
      AND "assetFamilyId" = family_id AND "name" = 'YOYO ANDAMIO COLGANTE';
  IF yoyo_id IS NULL OR yoyo_subfamily_id IS NULL THEN
    RAISE EXCEPTION 'Reviewed scaffold catalogue differs; stop and review before classifying yoyo';
  END IF;
  IF current_subfamily_id IS NOT NULL AND current_subfamily_id <> yoyo_subfamily_id THEN
    RAISE EXCEPTION 'Yoyo already has another classification; manual review required';
  END IF;
  UPDATE "Sku" SET "assetSubfamilyId" = yoyo_subfamily_id
    WHERE "id" = yoyo_id AND "assetSubfamilyId" IS NULL;
END $$;
