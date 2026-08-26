DO $$
DECLARE
  encofrado_id TEXT;
  extra_corto_subfamily_id TEXT;
  corto_subfamily_id TEXT;
  mediano_subfamily_id TEXT;
  largo_subfamily_id TEXT;
  extra_largo_subfamily_id TEXT;
  obsolete_sku_id TEXT;
  long_target_sku_id TEXT;
  duplicate_sku_id TEXT;
BEGIN
  SELECT "id"
  INTO encofrado_id
  FROM "AssetFamily"
  WHERE "code" = 'ENCOFRADO';

  IF encofrado_id IS NULL THEN
    RAISE NOTICE 'ENCOFRADO family does not exist; skipping canonical jack catalog data migration.';
    RETURN;
  END IF;

  -- These references were already consolidated and must have no remaining dependencies.
  FOR obsolete_sku_id IN
    SELECT "id"
    FROM "Sku"
    WHERE "assetFamilyId" = encofrado_id
      AND "name" IN (
        'GATO CORTO (2.60 M - 2.80 M)',
        'GATO CORTO (3.60 M)',
        'GATO LARGO (4.00 M)'
      )
      AND "active" = false
  LOOP
    IF EXISTS (SELECT 1 FROM "Asset" WHERE "skuId" = obsolete_sku_id)
      OR EXISTS (SELECT 1 FROM "DocumentItem" WHERE "skuId" = obsolete_sku_id)
      OR EXISTS (SELECT 1 FROM "StockLedger" WHERE "skuId" = obsolete_sku_id)
      OR EXISTS (SELECT 1 FROM "ProviderSkuPrice" WHERE "skuId" = obsolete_sku_id)
      OR EXISTS (SELECT 1 FROM "ProviderReceiptItem" WHERE "skuId" = obsolete_sku_id)
      OR EXISTS (SELECT 1 FROM "ProviderPickupItem" WHERE "skuId" = obsolete_sku_id)
    THEN
      RAISE EXCEPTION 'Obsolete jack SKU % still has dependencies; refusing to delete it.', obsolete_sku_id;
    END IF;

    DELETE FROM "Sku" WHERE "id" = obsolete_sku_id;
  END LOOP;

  -- Local/dev may still contain the two pre-consolidation long-jack references.
  -- Keep one SKU identity and move every relation before deleting the duplicate.
  SELECT "id"
  INTO long_target_sku_id
  FROM "Sku"
  WHERE "assetFamilyId" = encofrado_id
    AND "name" IN (
      'GATO LARGO (2.30 M - 3.60 M)',
      'GATO LARGO (3.60 M)',
      'GATO LARGO (4.00 M)',
      'GATO CORTO (3.60 M)'
    )
  ORDER BY
    CASE
      WHEN "id" = 'e7140bfd-4dcd-46b4-b26e-810568e5f827' THEN 0
      WHEN "name" = 'GATO LARGO (2.30 M - 3.60 M)' THEN 1
      WHEN "name" = 'GATO LARGO (3.60 M)' THEN 2
      ELSE 3
    END,
    "createdAt"
  LIMIT 1;

  IF long_target_sku_id IS NOT NULL THEN
    FOR duplicate_sku_id IN
      SELECT "id"
      FROM "Sku"
      WHERE "assetFamilyId" = encofrado_id
        AND "id" <> long_target_sku_id
        AND "name" IN (
          'GATO LARGO (2.30 M - 3.60 M)',
          'GATO LARGO (3.60 M)',
          'GATO LARGO (4.00 M)',
          'GATO CORTO (3.60 M)'
        )
    LOOP
      DELETE FROM "ProviderSkuPrice" source_price
      USING "ProviderSkuPrice" target_price
      WHERE source_price."skuId" = duplicate_sku_id
        AND target_price."skuId" = long_target_sku_id
        AND target_price."providerWarehouseId" = source_price."providerWarehouseId";

      UPDATE "ProviderSkuPrice" SET "skuId" = long_target_sku_id
      WHERE "skuId" = duplicate_sku_id;
      UPDATE "Asset" SET "skuId" = long_target_sku_id
      WHERE "skuId" = duplicate_sku_id;
      UPDATE "DocumentItem" SET "skuId" = long_target_sku_id
      WHERE "skuId" = duplicate_sku_id;
      UPDATE "StockLedger" SET "skuId" = long_target_sku_id
      WHERE "skuId" = duplicate_sku_id;
      UPDATE "ProviderReceiptItem" SET "skuId" = long_target_sku_id
      WHERE "skuId" = duplicate_sku_id;
      UPDATE "ProviderPickupItem" SET "skuId" = long_target_sku_id
      WHERE "skuId" = duplicate_sku_id;

      DELETE FROM "Sku" WHERE "id" = duplicate_sku_id;
    END LOOP;
  END IF;

  INSERT INTO "AssetSubfamily" (
    "id", "assetFamilyId", "code", "name", "active", "createdAt", "updatedAt"
  )
  VALUES
    (gen_random_uuid()::text, encofrado_id, 'GATO_EXTRA_CORTO', 'GATO EXTRA CORTO', true, NOW(), NOW()),
    (gen_random_uuid()::text, encofrado_id, 'GATO_CORTO', 'GATO CORTO', true, NOW(), NOW()),
    (gen_random_uuid()::text, encofrado_id, 'GATO_MEDIANO', 'GATO MEDIANO', true, NOW(), NOW()),
    (gen_random_uuid()::text, encofrado_id, 'GATO_LARGO', 'GATO LARGO', true, NOW(), NOW()),
    (gen_random_uuid()::text, encofrado_id, 'GATO_EXTRA_LARGO', 'GATO EXTRA LARGO', true, NOW(), NOW())
  ON CONFLICT ("assetFamilyId", "code") DO UPDATE
  SET "name" = EXCLUDED."name",
      "active" = true,
      "updatedAt" = NOW();

  SELECT "id" INTO extra_corto_subfamily_id
  FROM "AssetSubfamily"
  WHERE "assetFamilyId" = encofrado_id AND "code" = 'GATO_EXTRA_CORTO';

  SELECT "id" INTO corto_subfamily_id
  FROM "AssetSubfamily"
  WHERE "assetFamilyId" = encofrado_id AND "code" = 'GATO_CORTO';

  SELECT "id" INTO mediano_subfamily_id
  FROM "AssetSubfamily"
  WHERE "assetFamilyId" = encofrado_id AND "code" = 'GATO_MEDIANO';

  SELECT "id" INTO largo_subfamily_id
  FROM "AssetSubfamily"
  WHERE "assetFamilyId" = encofrado_id AND "code" = 'GATO_LARGO';

  SELECT "id" INTO extra_largo_subfamily_id
  FROM "AssetSubfamily"
  WHERE "assetFamilyId" = encofrado_id AND "code" = 'GATO_EXTRA_LARGO';

  IF (SELECT COUNT(*) FROM "Sku" WHERE "assetFamilyId" = encofrado_id AND "name" IN (
    'GATO CORTO (1.00 M)', 'GATO EXTRA CORTO (1.60 M)', 'GATO EXTRA CORTO (1.00 M)'
  )) > 1 THEN
    RAISE EXCEPTION 'More than one extra-short jack SKU exists.';
  END IF;
  UPDATE "Sku"
  SET "name" = 'GATO EXTRA CORTO (1.00 M)',
      "size" = '1.00 M',
      "lengthMeters" = 1.00,
      "assetSubfamilyId" = extra_corto_subfamily_id,
      "active" = true
  WHERE "assetFamilyId" = encofrado_id
    AND "name" IN (
      'GATO CORTO (1.00 M)', 'GATO EXTRA CORTO (1.60 M)', 'GATO EXTRA CORTO (1.00 M)'
    );
  IF NOT FOUND THEN
    INSERT INTO "Sku" (
      "id", "name", "assetFamilyId", "assetSubfamilyId", "size", "lengthMeters", "active", "createdAt"
    ) VALUES (
      gen_random_uuid()::text, 'GATO EXTRA CORTO (1.00 M)', encofrado_id,
      extra_corto_subfamily_id, '1.00 M', 1.00, true, NOW()
    );
  END IF;

  IF (SELECT COUNT(*) FROM "Sku" WHERE "assetFamilyId" = encofrado_id AND "name" IN (
    'GATO CORTO (2.00 M - 3.00 M)', 'GATO CORTO (2.00 M)'
  )) > 1 THEN
    RAISE EXCEPTION 'More than one short jack SKU exists.';
  END IF;
  UPDATE "Sku"
  SET "name" = 'GATO CORTO (2.00 M)',
      "size" = '2.00 M',
      "lengthMeters" = 2.00,
      "assetSubfamilyId" = corto_subfamily_id,
      "active" = true
  WHERE "assetFamilyId" = encofrado_id
    AND "name" IN ('GATO CORTO (2.00 M - 3.00 M)', 'GATO CORTO (2.00 M)');
  IF NOT FOUND THEN
    INSERT INTO "Sku" (
      "id", "name", "assetFamilyId", "assetSubfamilyId", "size", "lengthMeters", "active", "createdAt"
    ) VALUES (
      gen_random_uuid()::text, 'GATO CORTO (2.00 M)', encofrado_id,
      corto_subfamily_id, '2.00 M', 2.00, true, NOW()
    );
  END IF;

  INSERT INTO "Sku" (
    "id", "name", "assetFamilyId", "assetSubfamilyId", "size", "lengthMeters", "active", "createdAt"
  )
  SELECT
    gen_random_uuid()::text, 'GATO MEDIANO (3.00 M)', encofrado_id,
    mediano_subfamily_id, '3.00 M', 3.00, true, NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM "Sku"
    WHERE "assetFamilyId" = encofrado_id AND "name" = 'GATO MEDIANO (3.00 M)'
  );
  UPDATE "Sku"
  SET "size" = '3.00 M',
      "lengthMeters" = 3.00,
      "assetSubfamilyId" = mediano_subfamily_id,
      "active" = true
  WHERE "assetFamilyId" = encofrado_id AND "name" = 'GATO MEDIANO (3.00 M)';

  IF (SELECT COUNT(*) FROM "Sku" WHERE "assetFamilyId" = encofrado_id AND "name" IN (
    'GATO LARGO (3.60 M)', 'GATO LARGO (2.30 M - 3.60 M)', 'GATO LARGO (4.00 M)'
  )) > 1 THEN
    RAISE EXCEPTION 'More than one long jack SKU exists.';
  END IF;
  UPDATE "Sku"
  SET "name" = 'GATO LARGO (4.00 M)',
      "size" = '4.00 M',
      "lengthMeters" = 4.00,
      "assetSubfamilyId" = largo_subfamily_id,
      "active" = true
  WHERE "assetFamilyId" = encofrado_id
    AND "name" IN (
      'GATO LARGO (3.60 M)', 'GATO LARGO (2.30 M - 3.60 M)', 'GATO LARGO (4.00 M)'
    );
  IF NOT FOUND THEN
    INSERT INTO "Sku" (
      "id", "name", "assetFamilyId", "assetSubfamilyId", "size", "lengthMeters", "active", "createdAt"
    ) VALUES (
      gen_random_uuid()::text, 'GATO LARGO (4.00 M)', encofrado_id,
      largo_subfamily_id, '4.00 M', 4.00, true, NOW()
    );
  END IF;

  IF (SELECT COUNT(*) FROM "Sku" WHERE "assetFamilyId" = encofrado_id AND "name" IN (
    'GATO EXTRA LARGO (5.50 M)', 'GATO EXTRA LARGO (6.00 M)'
  )) > 1 THEN
    RAISE EXCEPTION 'More than one extra-long jack SKU exists.';
  END IF;
  UPDATE "Sku"
  SET "name" = 'GATO EXTRA LARGO (6.00 M)',
      "size" = '6.00 M',
      "lengthMeters" = 6.00,
      "assetSubfamilyId" = extra_largo_subfamily_id,
      "active" = true
  WHERE "assetFamilyId" = encofrado_id
    AND "name" IN ('GATO EXTRA LARGO (5.50 M)', 'GATO EXTRA LARGO (6.00 M)');
  IF NOT FOUND THEN
    INSERT INTO "Sku" (
      "id", "name", "assetFamilyId", "assetSubfamilyId", "size", "lengthMeters", "active", "createdAt"
    ) VALUES (
      gen_random_uuid()::text, 'GATO EXTRA LARGO (6.00 M)', encofrado_id,
      extra_largo_subfamily_id, '6.00 M', 6.00, true, NOW()
    );
  END IF;

  IF (SELECT COUNT(*) FROM "Sku"
      WHERE "assetFamilyId" = encofrado_id AND "active" = true AND "name" LIKE 'GATO %') <> 5
  THEN
    RAISE EXCEPTION 'Canonical jack migration must leave exactly five active jack SKUs.';
  END IF;
END $$;
