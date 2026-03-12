-- Drop constraints/indexes tied to redundant Asset.assetFamilyId
DROP INDEX "Asset_warehouseOwnerId_assetFamilyId_internalNumber_key";
DROP INDEX "Asset_assetFamilyId_idx";
ALTER TABLE "Asset" DROP CONSTRAINT "Asset_assetFamilyId_fkey";

-- Remove redundant family reference from Asset (family is derived via skuId -> Sku.assetFamilyId)
ALTER TABLE "Asset" DROP COLUMN "assetFamilyId";

-- Keep efficient lookups on skuId
CREATE INDEX "Asset_skuId_idx" ON "Asset"("skuId");
