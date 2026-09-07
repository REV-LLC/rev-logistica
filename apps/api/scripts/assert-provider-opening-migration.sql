DO $$ BEGIN
  IF (SELECT count(*) FROM "StockLedger" WHERE "isOpeningBalance") <> 2 THEN
    RAISE EXCEPTION 'Migration must classify only the two provider catalogue openings';
  END IF;
  IF (SELECT sum("quantity") FROM "StockLedger") <> 6 THEN
    RAISE EXCEPTION 'Migration changed quantities';
  END IF;
  IF (SELECT "effectiveAt" FROM "StockLedger" WHERE "id" = 'vibrator') <> '2026-09-07 15:00'::timestamp THEN
    RAISE EXCEPTION 'Migration changed an audit timestamp';
  END IF;
END $$;
INSERT INTO "StockLedger" ("id", "ownerWarehouseId", "assetId", "movementType", "quantity", "customerWorksiteId", "createdAt", "effectiveAt")
VALUES ('historical-delivery', 'provider', 'vibrator', 'ON_SITE', 1, 'site', '2026-09-07 17:00', '2026-09-02 12:00');
DO $$ DECLARE latest text; BEGIN
  SELECT "id" INTO latest FROM "StockLedger" WHERE "assetId" = 'vibrator'
    ORDER BY "isOpeningBalance" ASC, "effectiveAt" DESC, "createdAt" DESC, "id" DESC LIMIT 1;
  IF latest <> 'historical-delivery' THEN RAISE EXCEPTION 'Opening stock overrides real location'; END IF;
  BEGIN
    UPDATE "StockLedger" SET "isOpeningBalance" = true WHERE "id" = 'historical-delivery';
    RAISE EXCEPTION 'Constraint accepted a real movement as opening stock';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE "StockLedger" SET "isOpeningBalance" = true WHERE "id" = 'later-adjustment';
    RAISE EXCEPTION 'Constraint accepted duplicate opening stock';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
