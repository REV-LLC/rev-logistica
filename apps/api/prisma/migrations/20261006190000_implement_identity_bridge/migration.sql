-- Additive schema only. No automatic conversion, stock rewrite or unit links.
CREATE TABLE "ImplementIdentityBridge" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accessoryId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "openingLedgerId" TEXT NOT NULL,
  "evidenceSnapshot" JSONB NOT NULL,
  "createdBy" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImplementIdentityBridge_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ImplementIdentityBridge_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ImplementIdentityBridge_openingLedgerId_fkey" FOREIGN KEY ("openingLedgerId") REFERENCES "StockLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ImplementIdentityBridge_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ImplementIdentityBridge_accessoryId_key" ON "ImplementIdentityBridge"("accessoryId");
CREATE UNIQUE INDEX "ImplementIdentityBridge_assetId_key" ON "ImplementIdentityBridge"("assetId");
CREATE UNIQUE INDEX "ImplementIdentityBridge_openingLedgerId_key" ON "ImplementIdentityBridge"("openingLedgerId");
CREATE INDEX "ImplementIdentityBridge_createdBy_effectiveAt_idx" ON "ImplementIdentityBridge"("createdBy", "effectiveAt");
