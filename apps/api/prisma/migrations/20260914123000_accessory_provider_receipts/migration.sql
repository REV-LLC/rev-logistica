ALTER TYPE "AccessoryMovementType" ADD VALUE 'TRANSIT';
ALTER TYPE "AccessoryMovementType" ADD VALUE 'PROVIDER_RECEIVE';
ALTER TABLE "AccessoryBalance" ADD COLUMN "transitDocumentId" TEXT;
ALTER TABLE "AccessoryBalance" ADD CONSTRAINT "AccessoryBalance_transitDocumentId_fkey" FOREIGN KEY ("transitDocumentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AccessoryBalance_transitDocumentId_idx" ON "AccessoryBalance"("transitDocumentId");
ALTER TABLE "AccessoryBalance" DROP CONSTRAINT "AccessoryBalance_location_check";
ALTER TABLE "AccessoryBalance" ADD CONSTRAINT "AccessoryBalance_location_check" CHECK (
  ("warehouseId" IS NOT NULL AND "assetId" IS NULL AND "customerWorksiteId" IS NULL AND "transitDocumentId" IS NULL AND "locationKey" = 'warehouse:' || "warehouseId")
  OR ("assetId" IS NOT NULL AND "warehouseId" IS NULL AND "transitDocumentId" IS NULL AND "locationKey" = 'asset:' || "assetId" || CASE WHEN "customerWorksiteId" IS NULL THEN '' ELSE ':worksite:' || "customerWorksiteId" END)
  OR ("assetId" IS NOT NULL AND "warehouseId" IS NULL AND "customerWorksiteId" IS NULL AND "transitDocumentId" IS NOT NULL AND "locationKey" = 'transit:' || "transitDocumentId" || ':asset:' || "assetId")
);
CREATE TABLE "AccessoryProviderReceiptItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "receiptDocumentId" TEXT NOT NULL,
  "sourceMovementId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
  CONSTRAINT "AccessoryProviderReceiptItem_receiptDocumentId_fkey" FOREIGN KEY ("receiptDocumentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AccessoryProviderReceiptItem_sourceMovementId_fkey" FOREIGN KEY ("sourceMovementId") REFERENCES "AccessoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AccessoryProviderReceiptItem_receiptDocumentId_sourceMovementId_key" ON "AccessoryProviderReceiptItem"("receiptDocumentId", "sourceMovementId");
CREATE INDEX "AccessoryProviderReceiptItem_sourceMovementId_idx" ON "AccessoryProviderReceiptItem"("sourceMovementId");
