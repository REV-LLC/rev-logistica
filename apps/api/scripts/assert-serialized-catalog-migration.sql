DO $$ BEGIN
  IF (SELECT array_agg("id" ORDER BY "id") FROM "StockLedger" WHERE "isOpeningBalance")
    IS DISTINCT FROM ARRAY['deleted-opening', 'hose', 'own-stock', 'physical-receipt', 'vibrator']::text[] THEN
    RAISE EXCEPTION 'Must classify own/custody catalogue openings without relabeling real movements or later adjustments';
  END IF;
  IF EXISTS (SELECT 1 FROM "StockLedger" l FULL JOIN original_ledger o USING ("id")
    WHERE o.original IS DISTINCT FROM (to_jsonb(l) - 'isOpeningBalance')) THEN
    RAISE EXCEPTION 'Migration altered ledger rows, quantities or timestamps';
  END IF;
  IF (SELECT "warehouseCurrentId" FROM "Asset" WHERE "id" = 'received-asset') IS NOT NULL THEN
    RAISE EXCEPTION 'Migration did not repair the stale warehouse projection after historical delivery';
  END IF;
  IF (SELECT "warehouseCurrentId" FROM "Asset" WHERE "id" = 'deleted-asset') IS NOT NULL THEN
    RAISE EXCEPTION 'Migration restored a warehouse for a deleted asset';
  END IF;
  IF (SELECT "warehouseCurrentId" FROM "Asset" WHERE "id" = 'own-asset') IS DISTINCT FROM 'own'
    OR (SELECT "warehouseCurrentId" FROM "Asset" WHERE "id" = 'documented-asset') IS DISTINCT FROM 'unchanged'
    OR (SELECT "createdAt" FROM "Asset" WHERE "id" = 'received-asset') <> '2026-09-07'::timestamp THEN
    RAISE EXCEPTION 'Migration changed unrelated assets, valid locations or asset audit timestamps';
  END IF;
END $$;

INSERT INTO "StockLedger" ("id", "ownerWarehouseId", "warehouseId", "assetId", "movementType", "quantity", "createdAt", "effectiveAt", "isOpeningBalance") VALUES
('new-custody-opening', 'provider', 'own', 'new-custody-asset', 'ADJUST', 1, '2026-09-08', '2026-09-08', true);
INSERT INTO "StockLedger" ("id", "ownerWarehouseId", "assetId", "movementType", "quantity", "customerWorksiteId", "createdAt", "effectiveAt") VALUES
('own-historical-delivery', 'own', 'own-asset', 'ON_SITE', 1, 'site', '2026-09-08', '2026-09-01');
DO $$ DECLARE latest text; BEGIN
  SELECT "id" INTO latest FROM "StockLedger" WHERE "assetId" = 'own-asset'
    ORDER BY "isOpeningBalance" ASC, "effectiveAt" DESC, "createdAt" DESC, "id" DESC LIMIT 1;
  IF latest <> 'own-historical-delivery' THEN RAISE EXCEPTION 'Catalogue registration overrides physical location'; END IF;
  BEGIN
    UPDATE "StockLedger" SET "isOpeningBalance" = true WHERE "id" = 'own-historical-delivery';
    RAISE EXCEPTION 'Constraint accepted real movement as catalogue stock';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE "StockLedger" SET "quantity" = 2 WHERE "id" = 'new-custody-opening';
    RAISE EXCEPTION 'Constraint accepted multiple units for serialized opening';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE "StockLedger" SET "warehouseId" = 'own' WHERE "id" = 'hose';
    RAISE EXCEPTION 'Constraint loosened bulk opening custody shape';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE "StockLedger" SET "isOpeningBalance" = true WHERE "id" = 'own-later-adjustment';
    RAISE EXCEPTION 'Constraint accepted duplicate opening for serialized asset';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
