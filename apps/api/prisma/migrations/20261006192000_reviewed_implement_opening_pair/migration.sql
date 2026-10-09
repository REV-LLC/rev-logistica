-- Keep one catalogue baseline per serialized asset. A reviewed implement
-- already on site additionally needs one custody offset, not another unit.
BEGIN;

DROP INDEX "one_asset_opening_balance";
CREATE UNIQUE INDEX "one_asset_opening_balance" ON "StockLedger" ("assetId")
WHERE "isOpeningBalance" AND "assetId" IS NOT NULL AND "movementType" = 'ADJUST';
CREATE UNIQUE INDEX "one_asset_opening_custody" ON "StockLedger" ("assetId")
WHERE "isOpeningBalance" AND "assetId" IS NOT NULL AND "movementType" = 'ON_SITE';

CREATE OR REPLACE FUNCTION assert_reviewed_implement_opening() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "ImplementIdentityBridge" bridge
    JOIN "StockLedger" baseline ON baseline."assetId" = bridge."assetId"
    WHERE bridge."openingLedgerId" = NEW."id"
      AND bridge."assetId" = NEW."assetId"
      AND bridge."effectiveAt" = NEW."effectiveAt"
      AND baseline."isOpeningBalance" AND baseline."movementType" = 'ADJUST'
      AND baseline."quantity" = 1 AND baseline."skuId" IS NULL
      AND baseline."warehouseId" = NEW."ownerWarehouseId"
      AND baseline."ownerWarehouseId" = NEW."ownerWarehouseId"
      AND baseline."effectiveAt" = NEW."effectiveAt"
      AND baseline."refDocumentId" IS NULL AND baseline."refDocumentType" IS NULL
      AND baseline."customerWorksiteId" IS NULL AND baseline."reversedByDocumentId" IS NULL
      AND bridge."evidenceSnapshot"->'openingLedgerIds' ? baseline."id"
      AND bridge."evidenceSnapshot"->'reviewedCustody'->>'ownerWarehouseId' = NEW."ownerWarehouseId"
      AND bridge."evidenceSnapshot"->'reviewedCustody'->>'customerWorksiteId' = NEW."customerWorksiteId"
  ) THEN
    RAISE EXCEPTION 'La apertura de un implemento en obra requiere su empalme de identidad revisado y una única apertura de inventario compatible.'
      USING ERRCODE = '23514', CONSTRAINT = 'reviewed_implement_opening';
  END IF;
  RETURN NULL;
END;
$$;

COMMIT;
