CREATE TYPE "InventorySnapshotStatus" AS ENUM ('STAGED', 'POSTED');
CREATE TYPE "InventorySnapshotSourceType" AS ENUM ('OWN_WAREHOUSE', 'OWN_WORKSITE', 'SUPPLIER');
CREATE TYPE "InventorySnapshotOwnershipType" AS ENUM ('OWN', 'SUPPLIER');
CREATE TYPE "InventorySnapshotDestinationType" AS ENUM ('WAREHOUSE', 'WORKSITE');

CREATE TABLE "InventorySnapshot" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "status" "InventorySnapshotStatus" NOT NULL DEFAULT 'STAGED',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventorySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventorySnapshotArticle" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "articleCode" TEXT NOT NULL,
    "articleName" TEXT NOT NULL,
    "groupCode" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "subgroupCode" TEXT,
    "subgroupName" TEXT,
    "appearsInWarehouse" BOOLEAN NOT NULL,
    "appearsOnSite" BOOLEAN NOT NULL,
    "appearsInSupplierInventory" BOOLEAN NOT NULL,
    "unitWeight" DECIMAL(65,30),
    "suggestedControlType" TEXT NOT NULL,
    "classificationStatus" TEXT NOT NULL,
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventorySnapshotArticle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventorySnapshotWarehouseMapping" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "legacyWarehouseCode" TEXT NOT NULL,
    "mappedWarehouseName" TEXT,
    "warehouseType" TEXT,
    "ownerName" TEXT,
    "appearsInOwnWarehouse" BOOLEAN NOT NULL,
    "appearsInOwnOnSite" BOOLEAN NOT NULL,
    "appearsInSupplierInventory" BOOLEAN NOT NULL,
    "sourceRows" INTEGER NOT NULL,
    "mappingStatus" TEXT NOT NULL,
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventorySnapshotWarehouseMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventorySnapshotEntry" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sourceType" "InventorySnapshotSourceType" NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "ownershipType" "InventorySnapshotOwnershipType" NOT NULL,
    "destinationType" "InventorySnapshotDestinationType" NOT NULL,
    "customerWorksiteId" TEXT,
    "warehouseId" TEXT,
    "customerDocument" TEXT,
    "customerName" TEXT,
    "worksiteExternalCode" TEXT,
    "worksiteName" TEXT,
    "costCenterCode" TEXT,
    "costCenterName" TEXT,
    "legacyWarehouseCode" TEXT NOT NULL,
    "groupCode" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "subgroupCode" TEXT,
    "subgroupName" TEXT,
    "articleCode" TEXT NOT NULL,
    "articleName" TEXT NOT NULL,
    "initialBalance" DECIMAL(65,30) NOT NULL,
    "inventoryIn" DECIMAL(65,30) NOT NULL,
    "rentalIn" DECIMAL(65,30) NOT NULL,
    "inventoryOut" DECIMAL(65,30) NOT NULL,
    "rentalOut" DECIMAL(65,30) NOT NULL,
    "finalBalance" DECIMAL(65,30) NOT NULL,
    "unitWeight" DECIMAL(65,30),
    "totalWeight" DECIMAL(65,30),
    "relationStatus" TEXT NOT NULL,
    "warehouseMappingStatus" TEXT NOT NULL,
    "importStatus" TEXT NOT NULL,
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventorySnapshotEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventorySnapshot_sourceKey_key" ON "InventorySnapshot"("sourceKey");
CREATE UNIQUE INDEX "InventorySnapshotArticle_snapshotId_articleCode_key" ON "InventorySnapshotArticle"("snapshotId", "articleCode");
CREATE INDEX "InventorySnapshotArticle_articleCode_idx" ON "InventorySnapshotArticle"("articleCode");
CREATE UNIQUE INDEX "InventorySnapshotWarehouseMapping_snapshotId_legacyWare_key" ON "InventorySnapshotWarehouseMapping"("snapshotId", "legacyWarehouseCode");
CREATE INDEX "InventorySnapshotWarehouseMapping_legacyWarehouseCode_idx" ON "InventorySnapshotWarehouseMapping"("legacyWarehouseCode");
CREATE UNIQUE INDEX "InventorySnapshotEntry_snapshotId_sourceType_sourceRow_key" ON "InventorySnapshotEntry"("snapshotId", "sourceType", "sourceRow");
CREATE INDEX "InventorySnapshotEntry_articleCode_idx" ON "InventorySnapshotEntry"("articleCode");
CREATE INDEX "InventorySnapshotEntry_customerWorksiteId_idx" ON "InventorySnapshotEntry"("customerWorksiteId");
CREATE INDEX "InventorySnapshotEntry_warehouseId_idx" ON "InventorySnapshotEntry"("warehouseId");
CREATE INDEX "InventorySnapshotEntry_legacyWarehouseCode_idx" ON "InventorySnapshotEntry"("legacyWarehouseCode");
CREATE INDEX "InventorySnapshotEntry_sourceType_finalBalance_idx" ON "InventorySnapshotEntry"("sourceType", "finalBalance");

ALTER TABLE "InventorySnapshotArticle"
ADD CONSTRAINT "InventorySnapshotArticle_snapshotId_fkey"
FOREIGN KEY ("snapshotId") REFERENCES "InventorySnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventorySnapshotWarehouseMapping"
ADD CONSTRAINT "InventorySnapshotWarehouseMapping_snapshotId_fkey"
FOREIGN KEY ("snapshotId") REFERENCES "InventorySnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventorySnapshotEntry"
ADD CONSTRAINT "InventorySnapshotEntry_snapshotId_fkey"
FOREIGN KEY ("snapshotId") REFERENCES "InventorySnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventorySnapshotEntry"
ADD CONSTRAINT "InventorySnapshotEntry_customerWorksiteId_fkey"
FOREIGN KEY ("customerWorksiteId") REFERENCES "CustomerWorksite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventorySnapshotEntry"
ADD CONSTRAINT "InventorySnapshotEntry_warehouseId_fkey"
FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
