BEGIN;
-- Extend the exactly-one-target invariant to native bulk references.
-- This retains all existing identities and disallows ambiguous or empty targets.
ALTER TABLE "EquipmentConfigurationEntry" DROP CONSTRAINT "EquipmentConfigurationEntry_target_check";
ALTER TABLE "EquipmentConfigurationEntry" ADD CONSTRAINT "EquipmentConfigurationEntry_target_check"
  CHECK (num_nonnulls("assetId", "skuId", "accessoryId", "familyId") = 1);
COMMIT;
