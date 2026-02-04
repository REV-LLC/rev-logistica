/*
  Warnings:

  - You are about to drop the column `projectId` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `customerId` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `StockLedger` table. All the data in the column will be lost.
  - Added the required column `customerWorksiteId` to the `Document` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_customerId_fkey";

-- DropForeignKey
ALTER TABLE "StockLedger" DROP CONSTRAINT "StockLedger_projectId_fkey";

-- DropForeignKey
ALTER TABLE "StockLedger" DROP CONSTRAINT "StockLedger_warehouseId_fkey";

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "projectId",
ADD COLUMN     "customerWorksiteId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "customerId";

-- AlterTable
ALTER TABLE "StockLedger" DROP COLUMN "projectId",
ADD COLUMN     "customerWorksiteId" TEXT;

-- CreateTable
CREATE TABLE "CustomerWorksite" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "worksiteId" TEXT NOT NULL,
    "alias" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerWorksite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerWorksite_customerId_worksiteId_key" ON "CustomerWorksite"("customerId", "worksiteId");

-- AddForeignKey
ALTER TABLE "CustomerWorksite" ADD CONSTRAINT "CustomerWorksite_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerWorksite" ADD CONSTRAINT "CustomerWorksite_worksiteId_fkey" FOREIGN KEY ("worksiteId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_customerWorksiteId_fkey" FOREIGN KEY ("customerWorksiteId") REFERENCES "CustomerWorksite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_customerWorksiteId_fkey" FOREIGN KEY ("customerWorksiteId") REFERENCES "CustomerWorksite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
