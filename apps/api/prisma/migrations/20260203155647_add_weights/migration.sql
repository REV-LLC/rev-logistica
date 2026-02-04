/*
  Warnings:

  - You are about to alter the column `weight` on the `Asset` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.
  - You are about to alter the column `unitWeight` on the `Sku` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.

*/
-- AlterTable
ALTER TABLE "Asset" ALTER COLUMN "weight" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Sku" ALTER COLUMN "unitWeight" SET DATA TYPE DECIMAL(65,30);
