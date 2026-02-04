-- Add ON_SITE movement type
ALTER TYPE "MovementType" ADD VALUE 'ON_SITE';

-- Make warehouseId optional for ON_SITE movements
ALTER TABLE "StockLedger" ALTER COLUMN "warehouseId" DROP NOT NULL;
