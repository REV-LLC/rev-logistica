ALTER TABLE "DocumentItem"
  ADD COLUMN "accessoryId" TEXT,
  ADD COLUMN "accessorySourceBalanceId" TEXT,
  ADD COLUMN "accessoryName" TEXT,
  ADD COLUMN "accessoryCode" TEXT,
  ADD COLUMN "accessoryKind" "AccessoryKind";
ALTER TABLE "DocumentItem" ADD CONSTRAINT "DocumentItem_accessoryId_fkey"
  FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DocumentItem_accessoryId_idx" ON "DocumentItem"("accessoryId");
ALTER TABLE "DocumentItem" ADD CONSTRAINT "DocumentItem_accessory_check" CHECK (
  "accessoryId" IS NULL OR (
    "skuId" IS NULL AND "assetId" IS NULL AND "componentParentAssetId" IS NOT NULL
    AND "accessorySourceBalanceId" IS NOT NULL AND "accessoryName" IS NOT NULL
    AND "accessoryKind" IS NOT NULL AND "quantity" IS NOT NULL
    AND "quantity" > 0 AND "quantity" <= 1000000 AND "quantity" = trunc("quantity")
    AND ("accessoryKind" <> 'INDIVIDUAL' OR "quantity" = 1)
  )
);
ALTER TABLE "AccessoryBalance" ADD COLUMN "customerWorksiteId" TEXT;
ALTER TABLE "AccessoryBalance" ADD CONSTRAINT "AccessoryBalance_customerWorksiteId_fkey"
  FOREIGN KEY ("customerWorksiteId") REFERENCES "CustomerWorksite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AccessoryBalance_customerWorksiteId_idx" ON "AccessoryBalance"("customerWorksiteId");
ALTER TABLE "AccessoryBalance" DROP CONSTRAINT "AccessoryBalance_location_check";
ALTER TABLE "AccessoryBalance" ADD CONSTRAINT "AccessoryBalance_location_check" CHECK (
  ("warehouseId" IS NOT NULL AND "assetId" IS NULL AND "customerWorksiteId" IS NULL AND "locationKey" = 'warehouse:' || "warehouseId")
  OR ("assetId" IS NOT NULL AND "warehouseId" IS NULL AND "locationKey" = 'asset:' || "assetId" || CASE WHEN "customerWorksiteId" IS NULL THEN '' ELSE ':worksite:' || "customerWorksiteId" END)
);
ALTER TABLE "AccessoryMovement" ADD COLUMN "documentId" TEXT;
ALTER TABLE "AccessoryMovement" ADD CONSTRAINT "AccessoryMovement_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AccessoryMovement_documentId_idx" ON "AccessoryMovement"("documentId");
