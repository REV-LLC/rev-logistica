-- Additive only: no stock, document, accessory identity or compatibility is converted.
ALTER TABLE "Asset" ADD COLUMN "isImplement" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Sku" ADD COLUMN "isImplement" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Sku" ADD COLUMN "isConsumable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Sku" ADD CONSTRAINT "Sku_consumable_is_implement" CHECK (NOT "isConsumable" OR "isImplement");
ALTER TABLE "EquipmentConfigurationEntry" ADD COLUMN "recommendation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EquipmentConfigurationEntry" ADD COLUMN "skuId" TEXT;
ALTER TABLE "EquipmentConfigurationEntry" ADD CONSTRAINT "EquipmentConfigurationEntry_skuId_fkey"
  FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "EquipmentConfigurationEntry_configurationId_skuId_key"
  ON "EquipmentConfigurationEntry"("configurationId", "skuId");
-- Legacy requirements, limits and family relations are deliberately unchanged.
-- Their reviewed conversion is a separate operation; this migration creates no links.
