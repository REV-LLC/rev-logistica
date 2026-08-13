CREATE TYPE "AssetKind" AS ENUM ('STANDARD', 'MOTOR');
CREATE TYPE "AssetMotorConfiguration" AS ENUM ('NONE', 'FIXED', 'INTERCHANGEABLE');

ALTER TABLE "Asset"
ADD COLUMN "kind" "AssetKind" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "motorConfiguration" "AssetMotorConfiguration" NOT NULL DEFAULT 'NONE',
ADD COLUMN "assignedMotorId" TEXT;

CREATE UNIQUE INDEX "Asset_assignedMotorId_key" ON "Asset"("assignedMotorId");
ALTER TABLE "Asset"
ADD CONSTRAINT "Asset_assignedMotorId_fkey"
FOREIGN KEY ("assignedMotorId") REFERENCES "Asset"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Asset" AS asset
SET "kind" = 'MOTOR'
FROM "Sku" AS sku
JOIN "AssetFamily" AS family ON family.id = sku."assetFamilyId"
WHERE asset."skuId" = sku.id
  AND (
    UPPER(family.name) LIKE '%MOTOR%'
    OR UPPER(family.code) LIKE '%MOTOR%'
    OR UPPER(sku.name) LIKE 'MOTOR%'
  );

UPDATE "Asset" AS asset
SET "motorConfiguration" = CASE
  WHEN UPPER(sku.name) LIKE '%MEDIO BULTO%'
    OR UPPER(sku.name) LIKE '%1/2 BULTO%'
    OR UPPER(sku.name) LIKE '%0.5 BULTO%'
  THEN 'FIXED'::"AssetMotorConfiguration"
  ELSE 'INTERCHANGEABLE'::"AssetMotorConfiguration"
END
FROM "Sku" AS sku
JOIN "AssetFamily" AS family ON family.id = sku."assetFamilyId"
WHERE asset."skuId" = sku.id
  AND (
    UPPER(family.name) LIKE '%MEZCLADOR%'
    OR UPPER(family.code) LIKE '%MEZCLADOR%'
    OR UPPER(sku.name) LIKE '%MEZCLADOR%'
  );
