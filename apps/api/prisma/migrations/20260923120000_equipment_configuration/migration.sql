-- Additive: legacy components, equipment and documents are not reclassified.
CREATE TYPE "EquipmentPartRole" AS ENUM ('COMPONENT', 'ACCESSORY');
ALTER TYPE "AccessoryScope" ADD VALUE 'ACCESSORIES';
ALTER TABLE "Accessory" ADD COLUMN "purpose" "EquipmentPartRole" NOT NULL DEFAULT 'ACCESSORY',
  ADD COLUMN "exclusiveAssetId" TEXT;
ALTER TABLE "Accessory" ADD CONSTRAINT "Accessory_exclusiveAssetId_fkey" FOREIGN KEY ("exclusiveAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Accessory" ADD CONSTRAINT "Accessory_component_identity_check" CHECK ("purpose" <> 'COMPONENT' OR "kind" = 'INDIVIDUAL');
ALTER TABLE "Accessory" ADD CONSTRAINT "Accessory_exclusive_component_check" CHECK ("exclusiveAssetId" IS NULL OR ("purpose" = 'COMPONENT' AND "scope" = 'ASSETS'));
CREATE INDEX "Accessory_exclusiveAssetId_idx" ON "Accessory"("exclusiveAssetId");

CREATE TABLE "AccessoryParent" (
  "accessoryId" TEXT NOT NULL, "parentAccessoryId" TEXT NOT NULL,
  CONSTRAINT "AccessoryParent_pkey" PRIMARY KEY ("accessoryId", "parentAccessoryId"),
  CONSTRAINT "AccessoryParent_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AccessoryParent_parentAccessoryId_fkey" FOREIGN KEY ("parentAccessoryId") REFERENCES "Accessory"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessoryParent_not_self_check" CHECK ("accessoryId" <> "parentAccessoryId")
);
CREATE INDEX "AccessoryParent_parentAccessoryId_idx" ON "AccessoryParent"("parentAccessoryId");

CREATE TABLE "EquipmentConfiguration" (
  "id" TEXT NOT NULL PRIMARY KEY, "assetId" TEXT, "accessoryId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EquipmentConfiguration_owner_check" CHECK (("assetId" IS NOT NULL)::integer + ("accessoryId" IS NOT NULL)::integer = 1),
  CONSTRAINT "EquipmentConfiguration_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EquipmentConfiguration_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EquipmentConfiguration_assetId_key" ON "EquipmentConfiguration"("assetId");
CREATE UNIQUE INDEX "EquipmentConfiguration_accessoryId_key" ON "EquipmentConfiguration"("accessoryId");
CREATE TABLE "EquipmentConfigurationEntry" (
  "id" TEXT NOT NULL PRIMARY KEY, "configurationId" TEXT NOT NULL,
  "role" "EquipmentPartRole" NOT NULL, "assetId" TEXT, "accessoryId" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1, "defaultIncluded" BOOLEAN NOT NULL DEFAULT false,
  "required" BOOLEAN NOT NULL DEFAULT false, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "EquipmentConfigurationEntry_target_check" CHECK (("assetId" IS NOT NULL)::integer + ("accessoryId" IS NOT NULL)::integer = 1),
  CONSTRAINT "EquipmentConfigurationEntry_quantity_check" CHECK ("quantity" > 0 AND "quantity" <= 1000000 AND ("assetId" IS NULL OR "quantity" = 1)),
  CONSTRAINT "EquipmentConfigurationEntry_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "EquipmentConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EquipmentConfigurationEntry_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EquipmentConfigurationEntry_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "EquipmentConfigurationEntry_configurationId_sortOrder_idx" ON "EquipmentConfigurationEntry"("configurationId", "sortOrder");
CREATE INDEX "EquipmentConfigurationEntry_assetId_idx" ON "EquipmentConfigurationEntry"("assetId");
CREATE INDEX "EquipmentConfigurationEntry_accessoryId_idx" ON "EquipmentConfigurationEntry"("accessoryId");
CREATE UNIQUE INDEX "EquipmentConfigurationEntry_configurationId_assetId_key" ON "EquipmentConfigurationEntry"("configurationId", "assetId");
CREATE UNIQUE INDEX "EquipmentConfigurationEntry_configurationId_accessoryId_key" ON "EquipmentConfigurationEntry"("configurationId", "accessoryId");
CREATE TABLE "EquipmentConfigurationRevision" (
  "id" TEXT NOT NULL PRIMARY KEY, "configurationId" TEXT NOT NULL,
  "before" JSONB NOT NULL, "after" JSONB NOT NULL, "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipmentConfigurationRevision_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "EquipmentConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "EquipmentConfigurationRevision_configurationId_createdAt_idx" ON "EquipmentConfigurationRevision"("configurationId", "createdAt");
