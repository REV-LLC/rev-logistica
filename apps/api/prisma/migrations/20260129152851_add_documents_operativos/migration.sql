-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'REMISSION';
ALTER TYPE "DocumentType" ADD VALUE 'RETURN';
ALTER TYPE "DocumentType" ADD VALUE 'ADJUSTMENT';
ALTER TYPE "DocumentType" ADD VALUE 'CUTOVER';

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_customerWorksiteId_fkey";

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "warehouseId" TEXT,
ALTER COLUMN "status" SET DEFAULT 'DRAFT',
ALTER COLUMN "consecutive" DROP NOT NULL,
ALTER COLUMN "docDate" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "customerWorksiteId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_customerWorksiteId_fkey" FOREIGN KEY ("customerWorksiteId") REFERENCES "CustomerWorksite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
