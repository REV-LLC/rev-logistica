-- Explicitly confirmed asset, never the latest mixer. Preserve asset ID, number,
-- owner, location, historical document lines and stock ledger.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE
  mixer "Asset"%ROWTYPE;
  original_sku "Sku"%ROWTYPE;
  subfamily_id TEXT;
  reference_id TEXT;
BEGIN
  SELECT * INTO mixer FROM "Asset" WHERE id = '8ea3d2fa-5894-4fcb-b668-55423ac817ab' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO STRICT original_sku FROM "Sku" WHERE id = mixer."skuId";
  IF mixer."internalNumber" <> 6 OR mixer."assignedMotorId" IS NOT NULL OR
    NOT EXISTS (SELECT 1 FROM "Warehouse" WHERE id = mixer."warehouseOwnerId" AND name = 'Bodega Principal de Alquiler') OR
    NOT EXISTS (SELECT 1 FROM "AssetFamily" WHERE id = original_sku."assetFamilyId" AND code = 'MEZCLADORA') THEN
    RAISE EXCEPTION 'Confirmed mixer #6 identity or motor assignment changed. Review before correction.';
  END IF;
  IF EXISTS (SELECT 1 FROM "EquipmentConfigurationArchive" WHERE id = 'mixer-half-bag:' || mixer.id) THEN RETURN; END IF;
  INSERT INTO "EquipmentConfigurationArchive" (id, source, payload)
  VALUES ('mixer-half-bag:' || mixer.id, 'AssetCorrection', jsonb_build_object(
    'asset', to_jsonb(mixer), 'sku', to_jsonb(original_sku),
    'reason', 'User confirmed internal #6: half-bag, electric, fixed motor.'));

  INSERT INTO "AssetSubfamily" (id, "assetFamilyId", code, name, "updatedAt")
  VALUES (gen_random_uuid()::text, original_sku."assetFamilyId", 'MEDIO_BULTO', '1/2 bulto', CURRENT_TIMESTAMP)
  ON CONFLICT ("assetFamilyId", name) DO NOTHING;
  SELECT id INTO STRICT subfamily_id FROM "AssetSubfamily"
  WHERE "assetFamilyId" = original_sku."assetFamilyId" AND name = '1/2 bulto';

  INSERT INTO "Sku" (
    id, name, "imageUrl", "imageFileObjectId", "assetFamilyId", "assetSubfamilyId",
    price, "subrentalPrice", "replacementValue", "chargeType", "minimumChargeHours",
    size, "lengthMeters", "closedLengthMeters", "extendedLengthMeters", "areaM2", "unitWeight", active
  ) VALUES (
    gen_random_uuid()::text, 'MEZCLADORA 1/2 BULTO ELÉCTRICA MOTOR FIJO', original_sku."imageUrl",
    original_sku."imageFileObjectId", original_sku."assetFamilyId", subfamily_id,
    original_sku.price, original_sku."subrentalPrice", original_sku."replacementValue",
    original_sku."chargeType", original_sku."minimumChargeHours", original_sku.size,
    original_sku."lengthMeters", original_sku."closedLengthMeters", original_sku."extendedLengthMeters",
    original_sku."areaM2", original_sku."unitWeight", original_sku.active
  ) ON CONFLICT ("assetFamilyId", name) DO NOTHING;
  SELECT id INTO STRICT reference_id FROM "Sku" WHERE "assetFamilyId" = original_sku."assetFamilyId"
    AND name = 'MEZCLADORA 1/2 BULTO ELÉCTRICA MOTOR FIJO' AND "assetSubfamilyId" = subfamily_id;
  INSERT INTO "ProviderSkuPrice" (id, "providerWarehouseId", "skuId", price, "updatedAt")
  SELECT gen_random_uuid()::text, "providerWarehouseId", reference_id, price, CURRENT_TIMESTAMP
  FROM "ProviderSkuPrice" WHERE "skuId" = original_sku.id
  ON CONFLICT ("providerWarehouseId", "skuId") DO NOTHING;

  UPDATE "Asset" SET "skuId" = reference_id, fuel = 'ELECTRICO', "motorConfiguration" = 'FIXED'
  WHERE id = mixer.id;
  INSERT INTO "AssetInternalCounter" (id, "ownerWarehouseId", "assetSubfamilyId", "nextNumber", "updatedAt")
  VALUES (gen_random_uuid()::text, mixer."warehouseOwnerId", subfamily_id, 7, CURRENT_TIMESTAMP)
  ON CONFLICT ("ownerWarehouseId", "assetSubfamilyId")
  DO UPDATE SET "nextNumber" = GREATEST("AssetInternalCounter"."nextNumber", 7), "updatedAt" = CURRENT_TIMESTAMP;
  WITH updated AS (
    UPDATE "EquipmentConfiguration" SET notes = 'Motor fijo integrado · ELECTRICO. No requiere un motor separado en el documento.',
      version = version + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "assetId" = mixer.id RETURNING *
  )
  INSERT INTO "EquipmentConfigurationRevision" (id, "configurationId", before, after, "createdBy")
  SELECT gen_random_uuid()::text, id, jsonb_build_object('motorConfiguration', mixer."motorConfiguration", 'skuId', mixer."skuId"),
    to_jsonb(updated), 'CONFIRMED-MIXER-6-CORRECTION-20260928' FROM updated;
END $$;
COMMIT;
