-- Add controlType to AssetFamily (nullable first for backfill)
ALTER TABLE "AssetFamily" ADD COLUMN "controlType" "SkuControlType";

-- Backfill AssetFamily.controlType based on existing Sku.controlType
UPDATE "AssetFamily"
SET "controlType" = 'SERIAL'
WHERE EXISTS (
  SELECT 1
  FROM "Sku"
  WHERE "Sku"."assetFamilyId" = "AssetFamily"."id"
    AND "Sku"."controlType" = 'SERIAL'
);

UPDATE "AssetFamily"
SET "controlType" = 'BULK'
WHERE "controlType" IS NULL;

-- Ensure a fallback family for SKUs without assetFamilyId
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO "AssetFamily" ("id", "code", "name", "controlType", "createdAt")
SELECT gen_random_uuid(), 'MIGRATION_UNCLASSIFIED', 'MIGRATION_UNCLASSIFIED', 'BULK', now()
WHERE NOT EXISTS (
  SELECT 1 FROM "AssetFamily" WHERE "code" = 'MIGRATION_UNCLASSIFIED'
);

UPDATE "Sku"
SET "assetFamilyId" = (
  SELECT "id" FROM "AssetFamily" WHERE "code" = 'MIGRATION_UNCLASSIFIED' LIMIT 1
)
WHERE "assetFamilyId" IS NULL;

-- Enforce assetFamilyId required on Sku
ALTER TABLE "Sku" ALTER COLUMN "assetFamilyId" SET NOT NULL;

-- Drop global unique name and enforce per family uniqueness
DROP INDEX IF EXISTS "Sku_name_key";
CREATE UNIQUE INDEX "Sku_assetFamilyId_name_key" ON "Sku"("assetFamilyId", "name");

-- Remove controlType from Sku
ALTER TABLE "Sku" DROP COLUMN "controlType";

-- Backfill StockLedger.ownerWarehouseId and enforce NOT NULL
UPDATE "StockLedger"
SET "ownerWarehouseId" = (
  SELECT "warehouseOwnerId"
  FROM "Asset"
  WHERE "Asset"."id" = "StockLedger"."assetId"
)
WHERE "ownerWarehouseId" IS NULL
  AND "assetId" IS NOT NULL;

UPDATE "StockLedger"
SET "ownerWarehouseId" = "warehouseId"
WHERE "ownerWarehouseId" IS NULL
  AND "warehouseId" IS NOT NULL;

UPDATE "StockLedger"
SET "ownerWarehouseId" = (
  SELECT "id" FROM "Warehouse" WHERE "type" = 'OWN' ORDER BY "createdAt" ASC LIMIT 1
)
WHERE "ownerWarehouseId" IS NULL;

ALTER TABLE "StockLedger" ALTER COLUMN "ownerWarehouseId" SET NOT NULL;

-- Asset internal counters
CREATE TABLE "AssetInternalCounter" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "ownerWarehouseId" TEXT NOT NULL,
  "assetFamilyId" TEXT NOT NULL,
  "nextNumber" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AssetInternalCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssetInternalCounter_ownerWarehouseId_assetFamilyId_key"
  ON "AssetInternalCounter"("ownerWarehouseId", "assetFamilyId");

ALTER TABLE "AssetInternalCounter"
  ADD CONSTRAINT "AssetInternalCounter_ownerWarehouseId_fkey"
  FOREIGN KEY ("ownerWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AssetInternalCounter"
  ADD CONSTRAINT "AssetInternalCounter_assetFamilyId_fkey"
  FOREIGN KEY ("assetFamilyId") REFERENCES "AssetFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Initialize counters from existing assets
INSERT INTO "AssetInternalCounter" ("ownerWarehouseId", "assetFamilyId", "nextNumber", "createdAt", "updatedAt")
SELECT
  "warehouseOwnerId",
  "assetFamilyId",
  COALESCE(MAX("internalNumber"), 0) + 1,
  now(),
  now()
FROM "Asset"
GROUP BY "warehouseOwnerId", "assetFamilyId";

-- Enforce AssetFamily.controlType NOT NULL after backfill
ALTER TABLE "AssetFamily" ALTER COLUMN "controlType" SET NOT NULL;
