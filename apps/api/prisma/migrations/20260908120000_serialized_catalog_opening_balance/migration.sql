-- Registering a serialized asset is a catalogue operation for all owners and
-- initial locations. It does not date a physical acquisition or availability.
-- Keep the stricter provider-location shape for existing bulk opening stock.
BEGIN;

ALTER TABLE "StockLedger" DROP CONSTRAINT "provider_opening_balance_shape";
ALTER TABLE "StockLedger" ADD CONSTRAINT "catalog_opening_balance_shape"
CHECK (NOT "isOpeningBalance" OR (
  "movementType" = 'ADJUST' AND "quantity" > 0
  AND "refDocumentId" IS NULL AND "refDocumentType" IS NULL
  AND "customerWorksiteId" IS NULL AND "warehouseId" IS NOT NULL
  AND (
    ("assetId" IS NOT NULL AND "skuId" IS NULL AND "quantity" = 1)
    OR ("assetId" IS NULL AND "skuId" IS NOT NULL AND "warehouseId" = "ownerWarehouseId")
  )
));

-- Only the first REGISTERED entry can be an initial catalogue balance.
-- Operational backdating must not make a later adjustment become the first row.
WITH first_serial_rows AS (
  SELECT DISTINCT ON ("assetId") "id"
  FROM "StockLedger"
  WHERE "assetId" IS NOT NULL
  ORDER BY "assetId", "createdAt", "id"
), opened AS (
UPDATE "StockLedger" l SET "isOpeningBalance" = true
FROM first_serial_rows f
WHERE l."id" = f."id" AND NOT l."isOpeningBalance"
  AND l."movementType" = 'ADJUST' AND l."quantity" = 1
  AND l."skuId" IS NULL AND l."warehouseId" IS NOT NULL
  AND l."refDocumentId" IS NULL AND l."refDocumentType" IS NULL
  AND l."customerWorksiteId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "StockLedger" existing
    WHERE existing."assetId" = l."assetId" AND existing."isOpeningBalance"
  )
RETURNING l."id", l."assetId"
), latest AS (
  SELECT DISTINCT ON (l."assetId")
    l."assetId", l."movementType", l."warehouseId"
  FROM "StockLedger" l
  JOIN opened ON opened."assetId" = l."assetId"
  -- Data-modifying CTEs share a snapshot, so include the returned opening ID
  -- explicitly rather than relying on the marker changed by the sibling CTE.
  ORDER BY l."assetId", (l."isOpeningBalance" OR l."id" = opened."id") ASC,
    l."effectiveAt" DESC, l."createdAt" DESC, l."id" DESC
)
UPDATE "Asset" a
SET "warehouseCurrentId" = CASE
  WHEN latest."movementType" IN ('IN', 'ADJUST') THEN latest."warehouseId"
  ELSE NULL
END
FROM latest
WHERE a."id" = latest."assetId"
  AND a."deletedAt" IS NULL
  AND a."warehouseCurrentId" IS DISTINCT FROM CASE
    WHEN latest."movementType" IN ('IN', 'ADJUST') THEN latest."warehouseId"
    ELSE NULL
  END;

COMMIT;
