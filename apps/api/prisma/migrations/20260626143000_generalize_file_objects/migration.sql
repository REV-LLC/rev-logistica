ALTER TABLE "FileObject" ALTER COLUMN "documentId" DROP NOT NULL;

ALTER TABLE "FileObject"
ADD COLUMN "entityType" TEXT,
ADD COLUMN "entityId" TEXT,
ADD COLUMN "category" TEXT,
ADD COLUMN "displayName" TEXT,
ADD COLUMN "originalName" TEXT,
ADD COLUMN "objectKey" TEXT,
ADD COLUMN "storageProvider" TEXT NOT NULL DEFAULT 'R2',
ADD COLUMN "sizeBytes" INTEGER,
ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "FileObject"
SET
  "entityType" = 'DOCUMENT',
  "entityId" = "documentId",
  "category" = "fileType"
WHERE "documentId" IS NOT NULL;

CREATE INDEX "FileObject_documentId_idx" ON "FileObject"("documentId");
CREATE INDEX "FileObject_entityType_entityId_idx" ON "FileObject"("entityType", "entityId");
CREATE INDEX "FileObject_fileType_idx" ON "FileObject"("fileType");
CREATE INDEX "FileObject_category_idx" ON "FileObject"("category");
CREATE INDEX "FileObject_expiresAt_idx" ON "FileObject"("expiresAt");
