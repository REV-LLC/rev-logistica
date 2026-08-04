ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'PROVIDER_RECEIPT';

ALTER TABLE "Document" ADD COLUMN "providerSourceDocumentId" TEXT;

CREATE TABLE "ProviderReceiptItem" (
    "id" TEXT NOT NULL,
    "receiptDocumentId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "sourceLedgerId" TEXT NOT NULL,
    "skuId" TEXT,
    "assetId" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderReceiptItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Document_providerSourceDocumentId_idx" ON "Document"("providerSourceDocumentId");
CREATE INDEX "ProviderReceiptItem_receiptDocumentId_idx" ON "ProviderReceiptItem"("receiptDocumentId");
CREATE INDEX "ProviderReceiptItem_sourceDocumentId_idx" ON "ProviderReceiptItem"("sourceDocumentId");
CREATE INDEX "ProviderReceiptItem_sourceLedgerId_idx" ON "ProviderReceiptItem"("sourceLedgerId");
CREATE INDEX "ProviderReceiptItem_skuId_idx" ON "ProviderReceiptItem"("skuId");
CREATE INDEX "ProviderReceiptItem_assetId_idx" ON "ProviderReceiptItem"("assetId");

ALTER TABLE "Document" ADD CONSTRAINT "Document_providerSourceDocumentId_fkey" FOREIGN KEY ("providerSourceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProviderReceiptItem" ADD CONSTRAINT "ProviderReceiptItem_receiptDocumentId_fkey" FOREIGN KEY ("receiptDocumentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderReceiptItem" ADD CONSTRAINT "ProviderReceiptItem_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderReceiptItem" ADD CONSTRAINT "ProviderReceiptItem_sourceLedgerId_fkey" FOREIGN KEY ("sourceLedgerId") REFERENCES "StockLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderReceiptItem" ADD CONSTRAINT "ProviderReceiptItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProviderReceiptItem" ADD CONSTRAINT "ProviderReceiptItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
