DROP INDEX IF EXISTS "Asset_assetFamilyId_internalNumber_key";
CREATE INDEX IF NOT EXISTS "Asset_assetFamilyId_idx" ON "Asset"("assetFamilyId");

-- Ensure internalNumber is unique per warehouseOwnerId before enforcing unique index
WITH numbered AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "warehouseOwnerId"
           ORDER BY "createdAt" ASC, "serialOrEngine" ASC, "id" ASC
         ) AS rn
  FROM "Asset"
  WHERE "warehouseOwnerId" IS NOT NULL
)
UPDATE "Asset"
SET "internalNumber" = numbered.rn
FROM numbered
WHERE "Asset"."id" = numbered."id";

CREATE UNIQUE INDEX IF NOT EXISTS "Asset_warehouseOwnerId_internalNumber_key" ON "Asset"("warehouseOwnerId", "internalNumber");
