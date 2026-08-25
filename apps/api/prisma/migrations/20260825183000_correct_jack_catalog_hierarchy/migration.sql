DO $$
DECLARE
  encofrado_id TEXT;
  gato_subfamily_id TEXT;
  stale_subfamily_id TEXT;
  reassigned_skus INTEGER;
BEGIN
  SELECT "id"
  INTO encofrado_id
  FROM "AssetFamily"
  WHERE "code" = 'ENCOFRADO';

  IF encofrado_id IS NULL THEN
    RAISE NOTICE 'ENCOFRADO family does not exist; skipping jack hierarchy correction.';
    RETURN;
  END IF;

  INSERT INTO "AssetSubfamily" (
    "id", "assetFamilyId", "code", "name", "active", "createdAt", "updatedAt"
  )
  VALUES (
    gen_random_uuid()::text, encofrado_id, 'GATO', 'GATO', true, NOW(), NOW()
  )
  ON CONFLICT ("assetFamilyId", "code") DO UPDATE
  SET "name" = 'GATO',
      "active" = true,
      "updatedAt" = NOW();

  SELECT "id"
  INTO gato_subfamily_id
  FROM "AssetSubfamily"
  WHERE "assetFamilyId" = encofrado_id
    AND "code" = 'GATO';

  UPDATE "Sku"
  SET "assetSubfamilyId" = gato_subfamily_id
  WHERE "assetFamilyId" = encofrado_id
    AND "name" IN (
      'GATO EXTRA CORTO (1.00 M)',
      'GATO CORTO (2.00 M)',
      'GATO MEDIANO (3.00 M)',
      'GATO LARGO (4.00 M)',
      'GATO EXTRA LARGO (6.00 M)'
    );

  GET DIAGNOSTICS reassigned_skus = ROW_COUNT;
  IF reassigned_skus <> 5 THEN
    RAISE EXCEPTION 'Expected to reassign five canonical jack SKUs, reassigned %.', reassigned_skus;
  END IF;

  FOR stale_subfamily_id IN
    SELECT "id"
    FROM "AssetSubfamily"
    WHERE "assetFamilyId" = encofrado_id
      AND "code" IN (
        'GATO_EXTRA_CORTO',
        'GATO_CORTO',
        'GATO_MEDIANO',
        'GATO_LARGO',
        'GATO_EXTRA_LARGO'
      )
  LOOP
    IF EXISTS (
      SELECT 1 FROM "Sku" WHERE "assetSubfamilyId" = stale_subfamily_id
    ) OR EXISTS (
      SELECT 1 FROM "AssetInternalCounter" WHERE "assetSubfamilyId" = stale_subfamily_id
    ) THEN
      RAISE EXCEPTION 'Old jack subfamily % still has dependencies.', stale_subfamily_id;
    END IF;

    DELETE FROM "AssetSubfamily" WHERE "id" = stale_subfamily_id;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM "Sku"
    WHERE "assetFamilyId" = encofrado_id
      AND "active" = true
      AND "name" LIKE 'GATO %'
      AND "assetSubfamilyId" <> gato_subfamily_id
  ) THEN
    RAISE EXCEPTION 'Every active jack SKU must belong to the GATO subfamily.';
  END IF;

  IF (SELECT COUNT(*) FROM "AssetSubfamily"
      WHERE "assetFamilyId" = encofrado_id AND "code" LIKE 'GATO%') <> 1
  THEN
    RAISE EXCEPTION 'ENCOFRADO must have exactly one GATO subfamily.';
  END IF;
END $$;
