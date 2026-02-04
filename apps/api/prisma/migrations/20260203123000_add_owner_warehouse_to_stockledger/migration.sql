ALTER TABLE "StockLedger" ADD COLUMN "ownerWarehouseId" TEXT;

ALTER TABLE "StockLedger"
  ADD CONSTRAINT "StockLedger_ownerWarehouseId_fkey"
  FOREIGN KEY ("ownerWarehouseId") REFERENCES "Warehouse"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "StockLedger_ownerWarehouseId_idx" ON "StockLedger"("ownerWarehouseId");
