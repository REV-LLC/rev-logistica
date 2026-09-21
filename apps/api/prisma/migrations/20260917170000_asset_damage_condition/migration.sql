ALTER TABLE "Asset" ADD COLUMN "isDamaged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "damageNote" TEXT;

CREATE TABLE "AssetConditionEvent" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "isDamaged" BOOLEAN NOT NULL,
  "note" TEXT NOT NULL,
  "changedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetConditionEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssetConditionEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssetConditionEvent_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AssetConditionEvent_assetId_createdAt_idx" ON "AssetConditionEvent"("assetId", "createdAt");
