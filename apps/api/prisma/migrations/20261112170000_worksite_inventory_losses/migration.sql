ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'LOSS';

CREATE TABLE "WorksiteInventoryLoss" (
  "id" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "customerWorksiteId" TEXT NOT NULL,
  "ownerWarehouseId" TEXT NOT NULL,
  "skuId" TEXT NOT NULL,
  "assetId" TEXT,
  "quantity" DECIMAL(65,30) NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "responsible" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "allocations" JSONB NOT NULL,
  "annexChargeKey" TEXT,
  "ledgerId" TEXT NOT NULL,
  CONSTRAINT "WorksiteInventoryLoss_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorksiteInventoryLoss_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "WorksiteInventoryLoss_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "StockLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorksiteInventoryLoss_requestKey_key" ON "WorksiteInventoryLoss"("requestKey");
CREATE UNIQUE INDEX "WorksiteInventoryLoss_ledgerId_key" ON "WorksiteInventoryLoss"("ledgerId");
CREATE UNIQUE INDEX "WorksiteInventoryLoss_annexChargeKey_key" ON "WorksiteInventoryLoss"("annexChargeKey");
CREATE INDEX "WorksiteInventoryLoss_customerWorksiteId_effectiveAt_idx" ON "WorksiteInventoryLoss"("customerWorksiteId", "effectiveAt");
