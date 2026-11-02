CREATE TYPE "RentalQuantityBasis" AS ENUM ('UNIT', 'AREA_M2');
ALTER TABLE "Sku" ADD COLUMN "rentalQuantityBasis" "RentalQuantityBasis" NOT NULL DEFAULT 'UNIT';
