ALTER TABLE "Asset" ADD COLUMN "motorPowerHp" DECIMAL(8,2), ADD COLUMN "motorVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_motorPowerHp_positive" CHECK ("motorPowerHp" IS NULL OR "motorPowerHp" > 0);
CREATE TABLE "AssetMotorCompatibility" (
  "motorAssetId" TEXT NOT NULL,
  "equipmentAssetId" TEXT NOT NULL,
  CONSTRAINT "AssetMotorCompatibility_pkey" PRIMARY KEY ("motorAssetId", "equipmentAssetId"),
  CONSTRAINT "AssetMotorCompatibility_motor_fkey" FOREIGN KEY ("motorAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssetMotorCompatibility_equipment_fkey" FOREIGN KEY ("equipmentAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssetMotorCompatibility_not_self" CHECK ("motorAssetId" <> "equipmentAssetId")
);
CREATE INDEX "AssetMotorCompatibility_equipmentAssetId_idx" ON "AssetMotorCompatibility"("equipmentAssetId");
-- Preserve only demonstrated compatibility. Do not infer compatibility across a family.
INSERT INTO "AssetMotorCompatibility" ("motorAssetId", "equipmentAssetId")
SELECT "assignedMotorId", "id" FROM "Asset"
WHERE "assignedMotorId" IS NOT NULL AND "motorConfiguration" = 'INTERCHANGEABLE';
