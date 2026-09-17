-- Disposable PostgreSQL fixture. Apply after test-provider-opening-migration.sql
-- and migration 20260907170000, then apply 20260908120000 and the assertions.
INSERT INTO "StockLedger" ("id", "ownerWarehouseId", "warehouseId", "assetId", "movementType", "quantity", "createdAt", "effectiveAt", "refDocumentId", "refDocumentType", "customerWorksiteId") VALUES
('documented-first', 'own', 'own', 'documented-asset', 'ADJUST', 1, '2026-09-01', '2026-09-01', 'receipt', 'REMISSION', NULL),
('documented-later-adjustment', 'own', 'own', 'documented-asset', 'ADJUST', 1, '2026-09-07', '2026-08-01', NULL, NULL, NULL),
('real-first', 'own', NULL, 'moved-asset', 'ON_SITE', 1, '2026-09-01', '2026-09-01', 'dispatch', 'REMISSION', 'site'),
('real-later-adjustment', 'own', 'own', 'moved-asset', 'ADJUST', 1, '2026-09-07', '2026-08-01', NULL, NULL, NULL),
('own-later-adjustment', 'own', 'own', 'own-asset', 'ADJUST', 1, '2026-09-08', '2026-08-01', NULL, NULL, NULL),
('custody-historical-delivery', 'provider', NULL, 'received-asset', 'ON_SITE', 1, '2026-09-08', '2026-09-01', 'real-delivery', 'REMISSION', 'site'),
('deleted-opening', 'own', 'own', 'deleted-asset', 'ADJUST', 1, '2026-09-07', '2026-09-07', NULL, NULL, NULL),
('on-site-initial', 'own', NULL, 'on-site-asset', 'ADJUST', 1, '2026-09-07', '2026-09-07', NULL, NULL, 'site');

CREATE TABLE "Asset" ("id" text PRIMARY KEY, "warehouseCurrentId" text, "createdAt" timestamp, "deletedAt" timestamp);
INSERT INTO "Asset" VALUES
('own-asset', 'own', '2026-09-07', NULL),
('received-asset', 'own', '2026-09-07', NULL),
('documented-asset', 'unchanged', '2026-09-01', NULL),
('deleted-asset', NULL, '2026-09-07', '2026-09-08');

-- All original fields must survive byte-for-byte; only the semantic marker changes.
CREATE TABLE original_ledger AS
SELECT "id", to_jsonb(l) - 'isOpeningBalance' AS original FROM "StockLedger" l;
