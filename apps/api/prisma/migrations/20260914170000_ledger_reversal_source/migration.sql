-- Keep compensated history while retiring the original operational source.
ALTER TABLE "StockLedger" ADD COLUMN "reversedByDocumentId" TEXT;
CREATE INDEX "StockLedger_reversedByDocumentId_idx" ON "StockLedger"("reversedByDocumentId");
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_reversedByDocumentId_fkey" FOREIGN KEY ("reversedByDocumentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
