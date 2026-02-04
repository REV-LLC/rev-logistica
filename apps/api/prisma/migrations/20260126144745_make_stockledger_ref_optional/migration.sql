-- DropForeignKey
ALTER TABLE "StockLedger" DROP CONSTRAINT "StockLedger_refDocumentId_fkey";

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_refDocumentId_fkey" FOREIGN KEY ("refDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
