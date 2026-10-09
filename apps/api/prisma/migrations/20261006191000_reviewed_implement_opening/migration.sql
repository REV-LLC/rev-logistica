-- A promoted unit already on site needs a native, reviewed opening custody
-- balance. It is not a new receipt or a fabricated historical remission.
-- Existing catalogue and BULK opening shapes retain their original checks.
BEGIN;

ALTER TABLE "StockLedger" DROP CONSTRAINT "catalog_opening_balance_shape";
ALTER TABLE "StockLedger" ADD CONSTRAINT "catalog_opening_balance_shape"
CHECK (NOT "isOpeningBalance" OR (
  "refDocumentId" IS NULL AND "refDocumentType" IS NULL
  AND (
    (
      "movementType" = 'ADJUST' AND "quantity" > 0
      AND "customerWorksiteId" IS NULL AND "warehouseId" IS NOT NULL
      AND (
        ("assetId" IS NOT NULL AND "skuId" IS NULL AND "quantity" = 1)
        OR ("assetId" IS NULL AND "skuId" IS NOT NULL AND "warehouseId" = "ownerWarehouseId")
      )
    ) OR (
      "movementType" = 'ON_SITE' AND "quantity" = 1
      AND "assetId" IS NOT NULL AND "skuId" IS NULL
      AND "warehouseId" IS NULL AND "customerWorksiteId" IS NOT NULL
      AND "reversedByDocumentId" IS NULL
    )
  )
));

-- Deferred because the opening and its identity bridge are inserted together
-- in one transaction. No unreviewed ON_SITE opening can be committed.
CREATE FUNCTION assert_reviewed_implement_opening() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "ImplementIdentityBridge" bridge
    WHERE bridge."openingLedgerId" = NEW."id"
      AND bridge."assetId" = NEW."assetId"
      AND bridge."effectiveAt" = NEW."effectiveAt"
  ) THEN
    RAISE EXCEPTION 'La apertura de un implemento en obra requiere su empalme de identidad revisado.'
      USING ERRCODE = '23514', CONSTRAINT = 'reviewed_implement_opening';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER reviewed_implement_opening
AFTER INSERT OR UPDATE ON "StockLedger"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW."isOpeningBalance" AND NEW."movementType" = 'ON_SITE')
EXECUTE FUNCTION assert_reviewed_implement_opening();

-- A bridge is cutover evidence, never an editable reassignment or delete flag.
CREATE FUNCTION preserve_implement_identity_bridge() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El empalme de identidad es evidencia histórica y no se puede modificar ni eliminar.'
    USING ERRCODE = '23514', CONSTRAINT = 'immutable_implement_identity_bridge';
END;
$$;

CREATE TRIGGER immutable_implement_identity_bridge
BEFORE UPDATE OR DELETE ON "ImplementIdentityBridge"
FOR EACH ROW EXECUTE FUNCTION preserve_implement_identity_bridge();

COMMIT;
