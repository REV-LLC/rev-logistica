CREATE TABLE "AssetSubfamily" (
  "id" TEXT NOT NULL,
  "assetFamilyId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AssetSubfamily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssetSubfamily_assetFamilyId_code_key"
  ON "AssetSubfamily"("assetFamilyId", "code");
CREATE UNIQUE INDEX "AssetSubfamily_assetFamilyId_name_key"
  ON "AssetSubfamily"("assetFamilyId", "name");

ALTER TABLE "AssetSubfamily"
  ADD CONSTRAINT "AssetSubfamily_assetFamilyId_fkey"
  FOREIGN KEY ("assetFamilyId") REFERENCES "AssetFamily"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every current SERIAL family starts with one stable numbering series.
INSERT INTO "AssetSubfamily" (
  "id",
  "assetFamilyId",
  "code",
  "name",
  "active",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  af."id",
  'ESTANDAR',
  'ESTÁNDAR',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "AssetFamily" af
WHERE af."controlType" = 'SERIAL';

ALTER TABLE "Sku" ADD COLUMN "assetSubfamilyId" TEXT;

UPDATE "Sku" sku
SET "assetSubfamilyId" = subfamily."id"
FROM "AssetSubfamily" subfamily
WHERE subfamily."assetFamilyId" = sku."assetFamilyId"
  AND subfamily."code" = 'ESTANDAR'
  AND EXISTS (
    SELECT 1
    FROM "AssetFamily" family
    WHERE family."id" = sku."assetFamilyId"
      AND family."controlType" = 'SERIAL'
  );

CREATE INDEX "Sku_assetSubfamilyId_idx" ON "Sku"("assetSubfamilyId");

ALTER TABLE "Sku"
  ADD CONSTRAINT "Sku_assetSubfamilyId_fkey"
  FOREIGN KEY ("assetSubfamilyId") REFERENCES "AssetSubfamily"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AssetInternalCounter" ADD COLUMN "assetSubfamilyId" TEXT;

UPDATE "AssetInternalCounter" counter
SET "assetSubfamilyId" = subfamily."id"
FROM "AssetSubfamily" subfamily
WHERE subfamily."assetFamilyId" = counter."assetFamilyId"
  AND subfamily."code" = 'ESTANDAR';

ALTER TABLE "AssetInternalCounter"
  ALTER COLUMN "assetSubfamilyId" SET NOT NULL;

DROP INDEX "AssetInternalCounter_ownerWarehouseId_assetFamilyId_key";
ALTER TABLE "AssetInternalCounter"
  DROP CONSTRAINT "AssetInternalCounter_assetFamilyId_fkey";
ALTER TABLE "AssetInternalCounter" DROP COLUMN "assetFamilyId";

CREATE UNIQUE INDEX "AssetInternalCounter_ownerWarehouseId_assetSubfamilyId_key"
  ON "AssetInternalCounter"("ownerWarehouseId", "assetSubfamilyId");

ALTER TABLE "AssetInternalCounter"
  ADD CONSTRAINT "AssetInternalCounter_assetSubfamilyId_fkey"
  FOREIGN KEY ("assetSubfamilyId") REFERENCES "AssetSubfamily"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
