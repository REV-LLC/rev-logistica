ALTER TABLE "Customer"
ADD COLUMN "documentsPhone" TEXT,
ADD COLUMN "contactDirectory" JSONB,
ADD COLUMN "updateToken" TEXT,
ADD COLUMN "updateTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "contactUpdatedAt" TIMESTAMP(3),
ADD COLUMN "contactUpdatedBy" TEXT;

CREATE UNIQUE INDEX "Customer_updateToken_key" ON "Customer"("updateToken");
