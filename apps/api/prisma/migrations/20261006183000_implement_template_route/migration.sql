-- Additive only: existing family recommendations remain direct children of
-- their principal equipment. No route, unit, inventory or historical mutation.
BEGIN;

ALTER TABLE "EquipmentConfigurationEntry"
  ADD COLUMN "templateParentFamilyId" TEXT;

ALTER TABLE "EquipmentConfigurationEntry"
  ADD CONSTRAINT "EquipmentConfigurationEntry_template_parent_family_fkey"
  FOREIGN KEY ("templateParentFamilyId") REFERENCES "AssetFamily"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EquipmentConfigurationEntry"
  ADD CONSTRAINT "EquipmentConfigurationEntry_template_route_target_check"
  CHECK (
    "templateParentFamilyId" IS NULL OR (
      "familyId" IS NOT NULL AND "templateParentFamilyId" <> "familyId"
    )
  );

CREATE INDEX "EquipmentConfigurationEntry_templateParentFamilyId_idx"
  ON "EquipmentConfigurationEntry"("templateParentFamilyId");

COMMIT;
