/*
  Warnings:

  - You are about to drop the column `ownerId` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `ownerId` on the `StockLedger` table. All the data in the column will be lost.
  - Added the required column `ownerCompanyId` to the `Warehouse` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Asset" DROP CONSTRAINT IF EXISTS "Asset_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "StockLedger" DROP CONSTRAINT IF EXISTS "StockLedger_ownerId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "StockLedger_ownerId_idx";

-- AlterTable
ALTER TABLE "Asset" DROP COLUMN IF EXISTS "ownerId";

-- AlterTable
ALTER TABLE "StockLedger" DROP COLUMN IF EXISTS "ownerId";

-- Ensure UUID generator exists for backfill insert.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- AlterTable (nullable first)
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "ownerCompanyId" TEXT;

-- Backfill ownerCompanyId with default owner (Vereal SA)
INSERT INTO "Owner" ("id", "name", "active", "createdAt")
SELECT gen_random_uuid(), 'Vereal SA', true, now()
WHERE NOT EXISTS (SELECT 1 FROM "Owner" WHERE "name" = 'Vereal SA');

UPDATE "Warehouse"
SET "ownerCompanyId" = (
  SELECT "id" FROM "Owner" WHERE "name" = 'Vereal SA' LIMIT 1
)
WHERE "ownerCompanyId" IS NULL;

-- Enforce NOT NULL
ALTER TABLE "Warehouse" ALTER COLUMN "ownerCompanyId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Warehouse"
  ADD CONSTRAINT "Warehouse_ownerCompanyId_fkey"
  FOREIGN KEY ("ownerCompanyId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
