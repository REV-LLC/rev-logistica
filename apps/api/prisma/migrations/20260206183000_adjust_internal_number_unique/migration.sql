-- Drop old uniqueness (warehouseOwnerId, internalNumber)
DROP INDEX IF EXISTS "Asset_warehouseOwnerId_internalNumber_key";

-- Enforce uniqueness per owner + asset family
CREATE UNIQUE INDEX "Asset_warehouseOwnerId_assetFamilyId_internalNumber_key"
  ON "Asset"("warehouseOwnerId", "assetFamilyId", "internalNumber");
