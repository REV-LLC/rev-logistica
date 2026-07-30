CREATE TABLE "LegacyWarehouse" (
    "code" TEXT NOT NULL,
    "branchCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alternateCode" TEXT,
    "occupancyEnabled" BOOLEAN NOT NULL,
    "sourceOwnFlag" BOOLEAN NOT NULL,
    "inventoryCode" TEXT,
    "costCenterCode" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceCreatedAt" TEXT,
    "sourceCreatedBy" TEXT,
    "sourceUpdatedAt" TEXT,
    "sourceUpdatedBy" TEXT,
    "operationalWarehouseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegacyWarehouse_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "LegacyWarehouse_operationalWarehouseId_idx"
ON "LegacyWarehouse"("operationalWarehouseId");

CREATE INDEX "LegacyWarehouse_name_idx" ON "LegacyWarehouse"("name");

ALTER TABLE "LegacyWarehouse"
ADD CONSTRAINT "LegacyWarehouse_operationalWarehouseId_fkey"
FOREIGN KEY ("operationalWarehouseId") REFERENCES "Warehouse"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
