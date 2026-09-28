-- Schema preparation only. Data conversion is an explicit, separately verified cutover.
CREATE TABLE "EquipmentConfigurationArchive" (
  "id" TEXT PRIMARY KEY, "source" TEXT NOT NULL, "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "EquipmentConfigurationEntry" ADD COLUMN "familyId" TEXT, ADD COLUMN "maximumQuantity" INTEGER;
ALTER TABLE "EquipmentConfigurationEntry" DROP CONSTRAINT "EquipmentConfigurationEntry_target_check";
ALTER TABLE "EquipmentConfigurationEntry" ADD CONSTRAINT "EquipmentConfigurationEntry_target_check"
  CHECK (num_nonnulls("assetId", "accessoryId", "familyId") = 1);
ALTER TABLE "EquipmentConfigurationEntry" ADD CONSTRAINT "EquipmentConfigurationEntry_maximum_check"
  CHECK ("maximumQuantity" IS NULL OR "maximumQuantity" >= "quantity");
ALTER TABLE "EquipmentConfigurationEntry" ADD CONSTRAINT "EquipmentConfigurationEntry_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "AssetFamily" (id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "EquipmentConfigurationEntry_configurationId_familyId_key"
  ON "EquipmentConfigurationEntry" ("configurationId", "familyId");
CREATE INDEX "EquipmentConfigurationEntry_familyId_idx" ON "EquipmentConfigurationEntry" ("familyId");
