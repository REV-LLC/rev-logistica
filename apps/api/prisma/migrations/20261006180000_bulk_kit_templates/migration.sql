ALTER TABLE "AssetFamily" ADD COLUMN "bulkKitsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "bulkKitPrefix" TEXT, ADD COLUMN "bulkKitSettingsVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "BulkKit" (
 "id" TEXT NOT NULL, "assetFamilyId" TEXT NOT NULL, "reference" TEXT NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT true, "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "BulkKit_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "BulkKit_assetFamilyId_fkey" FOREIGN KEY ("assetFamilyId") REFERENCES "AssetFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BulkKit_assetFamilyId_reference_key" ON "BulkKit"("assetFamilyId", "reference");
CREATE INDEX "BulkKit_assetFamilyId_active_idx" ON "BulkKit"("assetFamilyId", "active");
CREATE TABLE "BulkKitEntry" (
 "id" TEXT NOT NULL, "bulkKitId" TEXT NOT NULL, "skuId" TEXT NOT NULL,
 "quantity" INTEGER NOT NULL CHECK ("quantity" > 0), "sortOrder" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT "BulkKitEntry_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "BulkKitEntry_bulkKitId_fkey" FOREIGN KEY ("bulkKitId") REFERENCES "BulkKit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "BulkKitEntry_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BulkKitEntry_bulkKitId_skuId_key" ON "BulkKitEntry"("bulkKitId", "skuId");
CREATE INDEX "BulkKitEntry_skuId_idx" ON "BulkKitEntry"("skuId");
