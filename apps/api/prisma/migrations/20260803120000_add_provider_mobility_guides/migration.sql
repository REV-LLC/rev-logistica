CREATE TABLE "ProviderMobilityGuide" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "fileObjectId" TEXT NOT NULL,
    "machineReference" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderMobilityGuide_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderMobilityGuide_fileObjectId_key" ON "ProviderMobilityGuide"("fileObjectId");
CREATE INDEX "ProviderMobilityGuide_providerId_issuedAt_idx" ON "ProviderMobilityGuide"("providerId", "issuedAt");
CREATE INDEX "ProviderMobilityGuide_issuedAt_idx" ON "ProviderMobilityGuide"("issuedAt");
CREATE INDEX "ProviderMobilityGuide_expiresAt_idx" ON "ProviderMobilityGuide"("expiresAt");

ALTER TABLE "ProviderMobilityGuide" ADD CONSTRAINT "ProviderMobilityGuide_providerId_fkey"
FOREIGN KEY ("providerId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProviderMobilityGuide" ADD CONSTRAINT "ProviderMobilityGuide_fileObjectId_fkey"
FOREIGN KEY ("fileObjectId") REFERENCES "FileObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProviderMobilityGuide" ADD CONSTRAINT "ProviderMobilityGuide_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
