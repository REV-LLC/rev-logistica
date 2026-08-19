ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'PROVIDER_PICKUP';

ALTER TABLE "Document" ADD COLUMN "providerWarehouseId" TEXT;

CREATE TABLE "ProviderPickupItem" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "skuId" TEXT,
    "assetId" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderPickupItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Document_providerWarehouseId_idx" ON "Document"("providerWarehouseId");
CREATE INDEX "ProviderPickupItem_documentId_idx" ON "ProviderPickupItem"("documentId");
CREATE INDEX "ProviderPickupItem_skuId_idx" ON "ProviderPickupItem"("skuId");
CREATE INDEX "ProviderPickupItem_assetId_idx" ON "ProviderPickupItem"("assetId");

ALTER TABLE "Document"
ADD CONSTRAINT "Document_providerWarehouseId_fkey"
FOREIGN KEY ("providerWarehouseId") REFERENCES "Warehouse"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProviderPickupItem"
ADD CONSTRAINT "ProviderPickupItem_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "Document"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProviderPickupItem"
ADD CONSTRAINT "ProviderPickupItem_skuId_fkey"
FOREIGN KEY ("skuId") REFERENCES "Sku"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProviderPickupItem"
ADD CONSTRAINT "ProviderPickupItem_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
