-- Run only in an empty disposable PostgreSQL database.
CREATE TABLE "Warehouse" ("id" text PRIMARY KEY, "type" text);
CREATE TABLE "StockLedger" (
  "id" text PRIMARY KEY, "ownerWarehouseId" text, "warehouseId" text,
  "assetId" text, "skuId" text, "customerWorksiteId" text,
  "movementType" text, "quantity" numeric, "refDocumentId" text,
  "refDocumentType" text, "createdAt" timestamp, "effectiveAt" timestamp
);
INSERT INTO "Warehouse" VALUES ('provider', 'ALLY'), ('own', 'OWN');
INSERT INTO "StockLedger" ("id", "ownerWarehouseId", "warehouseId", "assetId", "skuId", "movementType", "quantity", "createdAt", "effectiveAt") VALUES
('vibrator', 'provider', 'provider', 'vibrator', NULL, 'ADJUST', 1, '2026-09-07 15:00', '2026-09-07 15:00'),
('hose', 'provider', 'provider', NULL, 'hose', 'ADJUST', 1, '2026-09-07 15:01', '2026-09-07 15:01'),
('later-adjustment', 'provider', 'provider', NULL, 'hose', 'ADJUST', 2, '2026-09-07 16:00', '2026-09-07 16:00'),
('own-stock', 'own', 'own', 'own-asset', NULL, 'ADJUST', 1, '2026-09-07', '2026-09-07'),
('physical-receipt', 'provider', 'own', 'received-asset', NULL, 'ADJUST', 1, '2026-09-07', '2026-09-07');
