ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OPERATOR';

CREATE TABLE "WorksiteFuelReceipt" (
  "id" TEXT NOT NULL,
  "worksiteId" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "quantityCans" DECIMAL(12,2) NOT NULL,
  "notes" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorksiteFuelReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetFueling" (
  "id" TEXT NOT NULL,
  "worksiteId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "fueledAt" TIMESTAMP(3) NOT NULL,
  "quantityCans" DECIMAL(12,2) NOT NULL,
  "hourMeter" DECIMAL(14,2) NOT NULL,
  "operatorEmployeeId" TEXT,
  "notes" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetFueling_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VehicleFueling" (
  "id" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "fueledAt" TIMESTAMP(3) NOT NULL,
  "quantityGallons" DECIMAL(12,3) NOT NULL,
  "odometerKm" DECIMAL(14,1) NOT NULL,
  "fullTank" BOOLEAN NOT NULL DEFAULT false,
  "totalCost" DECIMAL(14,2),
  "supplier" TEXT,
  "invoiceNumber" TEXT,
  "driverEmployeeId" TEXT,
  "notes" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleFueling_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorksiteFuelReceipt_worksiteId_receivedAt_idx" ON "WorksiteFuelReceipt"("worksiteId", "receivedAt");
CREATE INDEX "AssetFueling_worksiteId_fueledAt_idx" ON "AssetFueling"("worksiteId", "fueledAt");
CREATE INDEX "AssetFueling_assetId_fueledAt_idx" ON "AssetFueling"("assetId", "fueledAt");
CREATE INDEX "VehicleFueling_vehicleId_fueledAt_idx" ON "VehicleFueling"("vehicleId", "fueledAt");

ALTER TABLE "WorksiteFuelReceipt" ADD CONSTRAINT "WorksiteFuelReceipt_quantityCans_check" CHECK ("quantityCans" > 0 AND MOD("quantityCans", 0.5) = 0);
ALTER TABLE "AssetFueling" ADD CONSTRAINT "AssetFueling_quantityCans_check" CHECK ("quantityCans" > 0 AND MOD("quantityCans", 0.5) = 0);
ALTER TABLE "AssetFueling" ADD CONSTRAINT "AssetFueling_hourMeter_check" CHECK ("hourMeter" >= 0);
ALTER TABLE "VehicleFueling" ADD CONSTRAINT "VehicleFueling_quantityGallons_check" CHECK ("quantityGallons" > 0);
ALTER TABLE "VehicleFueling" ADD CONSTRAINT "VehicleFueling_odometerKm_check" CHECK ("odometerKm" >= 0);
ALTER TABLE "VehicleFueling" ADD CONSTRAINT "VehicleFueling_totalCost_check" CHECK ("totalCost" IS NULL OR "totalCost" >= 0);

ALTER TABLE "WorksiteFuelReceipt" ADD CONSTRAINT "WorksiteFuelReceipt_worksiteId_fkey" FOREIGN KEY ("worksiteId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorksiteFuelReceipt" ADD CONSTRAINT "WorksiteFuelReceipt_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetFueling" ADD CONSTRAINT "AssetFueling_worksiteId_fkey" FOREIGN KEY ("worksiteId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetFueling" ADD CONSTRAINT "AssetFueling_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetFueling" ADD CONSTRAINT "AssetFueling_operatorEmployeeId_fkey" FOREIGN KEY ("operatorEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetFueling" ADD CONSTRAINT "AssetFueling_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleFueling" ADD CONSTRAINT "VehicleFueling_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleFueling" ADD CONSTRAINT "VehicleFueling_driverEmployeeId_fkey" FOREIGN KEY ("driverEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VehicleFueling" ADD CONSTRAINT "VehicleFueling_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
