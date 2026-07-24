-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "registrationNumber" TEXT;

-- CreateTable
CREATE TABLE "MobilityGuide" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fileObjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobilityGuide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_registrationNumber_key" ON "Asset"("registrationNumber");

-- CreateIndex
CREATE INDEX "Asset_registrationNumber_idx" ON "Asset"("registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MobilityGuide_fileObjectId_key" ON "MobilityGuide"("fileObjectId");

-- CreateIndex
CREATE INDEX "MobilityGuide_assetId_issuedAt_idx" ON "MobilityGuide"("assetId", "issuedAt");

-- CreateIndex
CREATE INDEX "MobilityGuide_issuedAt_idx" ON "MobilityGuide"("issuedAt");

-- CreateIndex
CREATE INDEX "MobilityGuide_expiresAt_idx" ON "MobilityGuide"("expiresAt");

-- AddForeignKey
ALTER TABLE "MobilityGuide" ADD CONSTRAINT "MobilityGuide_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobilityGuide" ADD CONSTRAINT "MobilityGuide_fileObjectId_fkey"
FOREIGN KEY ("fileObjectId") REFERENCES "FileObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobilityGuide" ADD CONSTRAINT "MobilityGuide_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
