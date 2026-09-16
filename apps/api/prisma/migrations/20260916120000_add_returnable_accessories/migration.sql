-- Additive: do not relabel consumables or change any existing stock.
ALTER TYPE "AccessoryKind" ADD VALUE 'RETURNABLE';

ALTER TABLE "Accessory" DROP CONSTRAINT "Accessory_identity_check";
-- Compare text so the new enum value is not used before this migration commits.
ALTER TABLE "Accessory" ADD CONSTRAINT "Accessory_identity_check" CHECK (
  (kind::text = 'INDIVIDUAL' AND "internalCode" IS NOT NULL AND length(trim("internalCode")) > 0)
  OR (kind::text IN ('CONSUMABLE', 'RETURNABLE') AND "internalCode" IS NULL)
);
