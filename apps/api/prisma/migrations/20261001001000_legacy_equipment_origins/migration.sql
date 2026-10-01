CREATE TABLE "LegacyEquipmentOrigin" (
  "id" TEXT NOT NULL,
  "sourceLedgerId" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "reviewedBy" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT NOT NULL,
  "evidenceSnapshot" JSONB NOT NULL,
  "commercialSnapshot" JSONB NOT NULL,
  CONSTRAINT "LegacyEquipmentOrigin_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LegacyEquipmentOrigin_cutoff_check" CHECK ("effectiveFrom" >= TIMESTAMP '2026-10-01 05:00:00'),
  CONSTRAINT "LegacyEquipmentOrigin_note_check" CHECK (length(trim("note")) >= 10),
  CONSTRAINT "LegacyEquipmentOrigin_sourceLedgerId_fkey" FOREIGN KEY ("sourceLedgerId") REFERENCES "StockLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LegacyEquipmentOrigin_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LegacyEquipmentOrigin_sourceLedgerId_key" ON "LegacyEquipmentOrigin"("sourceLedgerId");
CREATE INDEX "LegacyEquipmentOrigin_reviewedBy_idx" ON "LegacyEquipmentOrigin"("reviewedBy");
CREATE INDEX "LegacyEquipmentOrigin_effectiveFrom_idx" ON "LegacyEquipmentOrigin"("effectiveFrom");
ALTER TABLE "DocumentItem" ADD COLUMN "parentLegacyOriginId" TEXT;
ALTER TABLE "DocumentItem" ADD CONSTRAINT "DocumentItem_parentLegacyOriginId_fkey" FOREIGN KEY ("parentLegacyOriginId") REFERENCES "LegacyEquipmentOrigin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DocumentItem_parentLegacyOriginId_idx" ON "DocumentItem"("parentLegacyOriginId");
ALTER TABLE "DocumentItem" ADD CONSTRAINT "DocumentItem_one_parent_v3_check" CHECK (num_nonnulls("parentCompositionNodeId", "parentSourceDocumentItemId", "parentLegacyOriginId") <= 1);
