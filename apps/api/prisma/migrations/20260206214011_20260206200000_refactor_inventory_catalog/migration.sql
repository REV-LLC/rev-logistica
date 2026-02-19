-- DropForeignKey
ALTER TABLE "Sku" DROP CONSTRAINT "Sku_assetFamilyId_fkey";

-- DropForeignKey
ALTER TABLE "StockLedger" DROP CONSTRAINT "StockLedger_ownerWarehouseId_fkey";

-- AlterTable
ALTER TABLE "AssetInternalCounter" ALTER COLUMN "id" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "Sku" ADD CONSTRAINT "Sku_assetFamilyId_fkey" FOREIGN KEY ("assetFamilyId") REFERENCES "AssetFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_ownerWarehouseId_fkey" FOREIGN KEY ("ownerWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
