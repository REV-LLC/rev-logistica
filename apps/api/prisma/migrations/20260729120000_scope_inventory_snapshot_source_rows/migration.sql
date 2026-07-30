DROP INDEX "InventorySnapshotEntry_snapshotId_sourceType_sourceRow_key";

CREATE UNIQUE INDEX "InventorySnapshotEntry_snapshotId_sourceType_destinationType_sourceRow_key"
ON "InventorySnapshotEntry"("snapshotId", "sourceType", "destinationType", "sourceRow");
