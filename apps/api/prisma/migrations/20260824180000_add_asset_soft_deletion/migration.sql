ALTER TABLE "Asset"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedByUserId" TEXT,
ADD COLUMN "deletionReason" TEXT;

CREATE INDEX "Asset_deletedAt_idx" ON "Asset"("deletedAt");
CREATE INDEX "Asset_deletedByUserId_idx" ON "Asset"("deletedByUserId");

ALTER TABLE "Asset"
ADD CONSTRAINT "Asset_deletedByUserId_fkey"
FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
