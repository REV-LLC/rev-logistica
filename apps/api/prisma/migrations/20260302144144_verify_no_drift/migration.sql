/*
  Warnings:

  - You are about to alter the column `price` on the `Sku` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.
  - You are about to alter the column `subrentalPrice` on the `Sku` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.
  - You are about to alter the column `areaM2` on the `Sku` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.

*/
-- AlterTable
ALTER TABLE "Sku" ALTER COLUMN "price" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "subrentalPrice" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "areaM2" SET DATA TYPE DECIMAL(65,30);
