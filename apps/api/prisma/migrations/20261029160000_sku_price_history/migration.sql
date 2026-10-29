CREATE TABLE "SkuPriceChange" (
    "id" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "oldPrice" DECIMAL(65,30),
    "newPrice" DECIMAL(65,30),
    "oldReplacementValue" DECIMAL(65,30),
    "newReplacementValue" DECIMAL(65,30),
    "reason" TEXT NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "changedByName" TEXT NOT NULL,
    "changedByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkuPriceChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SkuPriceChange_skuId_createdAt_id_idx" ON "SkuPriceChange"("skuId", "createdAt" DESC, "id" DESC);
CREATE INDEX "SkuPriceChange_changedByUserId_idx" ON "SkuPriceChange"("changedByUserId");
ALTER TABLE "SkuPriceChange" ADD CONSTRAINT "SkuPriceChange_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SkuPriceChange" ADD CONSTRAINT "SkuPriceChange_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
