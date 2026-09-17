-- Additive: existing documents retain their original source resolution.
ALTER TABLE "DocumentItem" ADD COLUMN "sourceWarehouseId" TEXT;
ALTER TABLE "DocumentItem" ADD CONSTRAINT "DocumentItem_sourceWarehouseId_fkey"
  FOREIGN KEY ("sourceWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DocumentItem_sourceWarehouseId_idx" ON "DocumentItem"("sourceWarehouseId");
