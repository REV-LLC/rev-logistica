-- Keep historical documents unchanged. New requests explicitly identify their
-- physical source independently from the delivery arrangements in notes.
CREATE TYPE "InventorySourceMode" AS ENUM ('WAREHOUSE', 'OWNER_WAREHOUSES');

ALTER TABLE "Document" ADD COLUMN "inventorySourceMode" "InventorySourceMode";
