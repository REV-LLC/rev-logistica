CREATE TYPE "SyncOperationStatus" AS ENUM ('PROCESSING', 'COMPLETED');

CREATE TABLE "SyncOperation" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" "SyncOperationStatus" NOT NULL DEFAULT 'PROCESSING',
    "response" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "SyncOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyncOperation_createdBy_idempotencyKey_key"
ON "SyncOperation"("createdBy", "idempotencyKey");

CREATE INDEX "SyncOperation_createdAt_idx" ON "SyncOperation"("createdAt");

ALTER TABLE "SyncOperation"
ADD CONSTRAINT "SyncOperation_createdBy_fkey"
FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
