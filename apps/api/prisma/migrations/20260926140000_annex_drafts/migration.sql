CREATE TABLE "AnnexDraft" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "customerWorksiteId" TEXT NOT NULL REFERENCES "CustomerWorksite"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "periodFrom" DATE NOT NULL,
  "periodTo" DATE NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("periodTo" >= "periodFrom" AND "periodTo" - "periodFrom" <= 30)
);
CREATE UNIQUE INDEX "AnnexDraft_customerWorksiteId_periodFrom_periodTo_key" ON "AnnexDraft"("customerWorksiteId", "periodFrom", "periodTo");
CREATE TABLE "AnnexDraftRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "draftId" TEXT NOT NULL REFERENCES "AnnexDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "through" DATE NOT NULL,
  "input" JSONB NOT NULL,
  "result" JSONB NOT NULL,
  "sourceIssues" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "reason" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AnnexDraftRevision_draftId_revision_key" ON "AnnexDraftRevision"("draftId", "revision");
