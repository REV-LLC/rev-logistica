CREATE TABLE "ProviderSkuPrice" (
    "id" TEXT NOT NULL,
    "providerWarehouseId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderSkuPrice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProviderSkuPrice_price_nonnegative" CHECK ("price" >= 0)
);

CREATE UNIQUE INDEX "ProviderSkuPrice_providerWarehouseId_skuId_key"
ON "ProviderSkuPrice"("providerWarehouseId", "skuId");

CREATE INDEX "ProviderSkuPrice_skuId_idx" ON "ProviderSkuPrice"("skuId");

ALTER TABLE "ProviderSkuPrice"
ADD CONSTRAINT "ProviderSkuPrice_providerWarehouseId_fkey"
FOREIGN KEY ("providerWarehouseId") REFERENCES "Warehouse"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProviderSkuPrice"
ADD CONSTRAINT "ProviderSkuPrice_skuId_fkey"
FOREIGN KEY ("skuId") REFERENCES "Sku"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
