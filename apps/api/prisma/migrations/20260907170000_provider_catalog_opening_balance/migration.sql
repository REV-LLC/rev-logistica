-- Opening catalogue stock has an audit timestamp, not an availability start.
-- Keep quantities, ownership, registration timestamps and real movements intact.
ALTER TABLE "StockLedger" ADD COLUMN "isOpeningBalance" BOOLEAN NOT NULL DEFAULT false;

-- Recognize only the first registered row for each provider item, and only if
-- it is positive, undocumented stock at the provider itself. Later adjustments
-- and receipts at our warehouses retain their chronological restrictions.
WITH first_rows AS (
  SELECT DISTINCT ON (l."ownerWarehouseId", l."assetId", l."skuId") l."id"
  FROM "StockLedger" l
  JOIN "Warehouse" w ON w."id" = l."ownerWarehouseId" AND w."type" = 'ALLY'
  ORDER BY l."ownerWarehouseId", l."assetId", l."skuId", l."createdAt", l."id"
)
UPDATE "StockLedger" l SET "isOpeningBalance" = true
FROM first_rows f
WHERE l."id" = f."id" AND l."movementType" = 'ADJUST'
  AND l."quantity" > 0 AND l."refDocumentId" IS NULL
  AND l."refDocumentType" IS NULL AND l."customerWorksiteId" IS NULL
  AND l."warehouseId" = l."ownerWarehouseId"
  AND ((l."assetId" IS NULL) <> (l."skuId" IS NULL));

ALTER TABLE "StockLedger" ADD CONSTRAINT "provider_opening_balance_shape"
CHECK (NOT "isOpeningBalance" OR (
  "movementType" = 'ADJUST' AND "quantity" > 0
  AND "refDocumentId" IS NULL AND "refDocumentType" IS NULL
  AND "customerWorksiteId" IS NULL AND "warehouseId" IS NOT NULL
  AND "warehouseId" = "ownerWarehouseId"
  AND (("assetId" IS NULL) <> ("skuId" IS NULL))
));
CREATE UNIQUE INDEX "one_asset_opening_balance" ON "StockLedger" ("assetId")
WHERE "isOpeningBalance" AND "assetId" IS NOT NULL;
CREATE UNIQUE INDEX "one_provider_sku_opening_balance" ON "StockLedger" ("ownerWarehouseId", "skuId")
WHERE "isOpeningBalance" AND "skuId" IS NOT NULL;
