ALTER TABLE "StockLedger"
ADD COLUMN "effectiveAt" TIMESTAMP(3);

UPDATE "StockLedger" AS ledger
SET "effectiveAt" = COALESCE(document."docDate", ledger."createdAt")
FROM "Document" AS document
WHERE ledger."refDocumentId" = document."id";

UPDATE "StockLedger"
SET "effectiveAt" = "createdAt"
WHERE "effectiveAt" IS NULL;

ALTER TABLE "StockLedger"
ALTER COLUMN "effectiveAt" SET NOT NULL,
ALTER COLUMN "effectiveAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "StockLedger_assetId_effectiveAt_createdAt_idx"
ON "StockLedger"("assetId", "effectiveAt" DESC, "createdAt" DESC);

CREATE INDEX "StockLedger_skuId_ownerWarehouseId_effectiveAt_idx"
ON "StockLedger"("skuId", "ownerWarehouseId", "effectiveAt" DESC);

-- Reconcile the denormalized current warehouse using business time. This also
-- repairs assets affected by a late-entered, backdated document.
WITH latest AS (
  SELECT DISTINCT ON (ledger."assetId")
    ledger."assetId",
    ledger."movementType",
    ledger."warehouseId"
  FROM "StockLedger" AS ledger
  WHERE ledger."assetId" IS NOT NULL
  ORDER BY ledger."assetId", ledger."effectiveAt" DESC, ledger."createdAt" DESC, ledger."id" DESC
)
UPDATE "Asset" AS asset
SET "warehouseCurrentId" = CASE
  WHEN latest."movementType" IN ('IN', 'ADJUST') THEN latest."warehouseId"
  ELSE NULL
END
FROM latest
WHERE asset."id" = latest."assetId";
