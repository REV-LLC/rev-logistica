-- Reconcile migration history with current database shape.
-- These legacy columns were already removed from runtime schema.
ALTER TABLE "Sku" DROP COLUMN IF EXISTS "brand";
ALTER TABLE "Sku" DROP COLUMN IF EXISTS "fuel";
ALTER TABLE "Sku" DROP COLUMN IF EXISTS "model";
ALTER TABLE "Sku" DROP COLUMN IF EXISTS "year";
