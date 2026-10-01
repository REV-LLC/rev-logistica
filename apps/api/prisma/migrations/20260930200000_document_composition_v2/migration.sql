-- Additive migration: no historical document is changed or backfilled.
ALTER TABLE "DocumentItem"
 ADD COLUMN "compositionNodeId" TEXT,
 ADD COLUMN "parentCompositionNodeId" TEXT,
 ADD COLUMN "sourceDocumentItemId" TEXT,
 ADD COLUMN "parentSourceDocumentItemId" TEXT;
CREATE UNIQUE INDEX "DocumentItem_documentId_compositionNodeId_key" ON "DocumentItem"("documentId", "compositionNodeId");
CREATE INDEX "DocumentItem_documentId_parentCompositionNodeId_idx" ON "DocumentItem"("documentId", "parentCompositionNodeId");
CREATE INDEX "DocumentItem_sourceDocumentItemId_idx" ON "DocumentItem"("sourceDocumentItemId");
CREATE INDEX "DocumentItem_parentSourceDocumentItemId_idx" ON "DocumentItem"("parentSourceDocumentItemId");
ALTER TABLE "DocumentItem"
 ADD CONSTRAINT "DocumentItem_documentId_parentCompositionNodeId_fkey" FOREIGN KEY ("documentId", "parentCompositionNodeId") REFERENCES "DocumentItem"("documentId", "compositionNodeId") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED,
 ADD CONSTRAINT "DocumentItem_sourceDocumentItemId_fkey" FOREIGN KEY ("sourceDocumentItemId") REFERENCES "DocumentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT "DocumentItem_parentSourceDocumentItemId_fkey" FOREIGN KEY ("parentSourceDocumentItemId") REFERENCES "DocumentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT "DocumentItem_composition_parent_check" CHECK (NOT ("parentCompositionNodeId" IS NOT NULL AND "parentSourceDocumentItemId" IS NOT NULL)),
 ADD CONSTRAINT "DocumentItem_composition_self_check" CHECK ("compositionNodeId" IS NULL OR "compositionNodeId" IS DISTINCT FROM "parentCompositionNodeId");
ALTER TABLE "CommercialProfile" DROP CONSTRAINT "CommercialProfile_scopeType_check";
ALTER TABLE "CommercialProfile" ADD CONSTRAINT "CommercialProfile_scopeType_check" CHECK ("scopeType" IN ('ASSET','SKU','FAMILY','ACCESSORY'));
