-- Remove redundant SKU category; source of truth is AssetFamily
ALTER TABLE "Sku" DROP COLUMN "category";
