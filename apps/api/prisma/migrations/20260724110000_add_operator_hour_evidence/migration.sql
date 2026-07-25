ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OPERATOR';

ALTER TABLE "AssetHourReading"
ADD COLUMN "evidenceFileObjectId" TEXT;

CREATE INDEX "AssetHourReading_evidenceFileObjectId_idx"
ON "AssetHourReading"("evidenceFileObjectId");
