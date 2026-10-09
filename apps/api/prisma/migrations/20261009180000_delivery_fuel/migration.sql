-- Delivery choice is separate from the permanent equipment's fuel and old motor assignments.
ALTER TABLE "AssetFamily" ADD COLUMN "deliveryFuelSelectable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DocumentItem" ADD COLUMN "deliveryFuel" TEXT;
ALTER TABLE "DocumentItem" ADD CONSTRAINT "DocumentItem_deliveryFuel_check"
  CHECK ("deliveryFuel" IS NULL OR "deliveryFuel" IN ('ELECTRICO', 'GASOLINA'));
-- Reviewed catalog identity, not a name-based runtime rule. New mixers inherit the family setting.
UPDATE "AssetFamily" SET "deliveryFuelSelectable" = true
WHERE id = 'aba7bd1c-8776-4891-9bb4-14661336bfaf' AND code = 'MEZCLADORA';
-- Intentionally no UPDATE to documents, motor assets, stock, or historical assignments.
