-- Add billing configuration to SKUs
CREATE TYPE "ChargeType" AS ENUM ('DAY', 'HOUR');

ALTER TABLE "Sku"
ADD COLUMN "chargeType" "ChargeType" NOT NULL DEFAULT 'DAY',
ADD COLUMN "minimumChargeHours" DECIMAL(65,30);
