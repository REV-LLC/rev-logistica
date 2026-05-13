-- CreateEnum
CREATE TYPE "DocumentItemBillingStatus" AS ENUM ('OPEN', 'CUT', 'CLOSED');

-- AlterTable
ALTER TABLE "DocumentItem" ADD COLUMN     "billingCutoffDate" TIMESTAMP(3),
ADD COLUMN     "billingNote" TEXT,
ADD COLUMN     "billingStatus" "DocumentItemBillingStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "billingUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "billingUpdatedBy" TEXT,
ADD COLUMN     "returnedAt" TIMESTAMP(3);
