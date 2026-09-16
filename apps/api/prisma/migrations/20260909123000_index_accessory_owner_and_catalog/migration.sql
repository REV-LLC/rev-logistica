-- Support ownership lookups/FK checks and deterministic catalog pagination.
CREATE INDEX "Accessory_ownerWarehouseId_idx" ON "Accessory"("ownerWarehouseId");
CREATE INDEX "Accessory_name_id_idx" ON "Accessory"("name", "id");
