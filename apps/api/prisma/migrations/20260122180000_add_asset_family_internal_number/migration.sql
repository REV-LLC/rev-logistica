CREATE TABLE "AssetFamily" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AssetFamily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssetFamily_code_key" ON "AssetFamily"("code");

ALTER TABLE "Sku" ADD COLUMN "assetFamilyId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "assetFamilyId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "internalNumber" INTEGER;

ALTER TABLE "Sku"
  ADD CONSTRAINT "Sku_assetFamilyId_fkey"
  FOREIGN KEY ("assetFamilyId") REFERENCES "AssetFamily"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_assetFamilyId_fkey"
  FOREIGN KEY ("assetFamilyId") REFERENCES "AssetFamily"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill families based on SKU name
INSERT INTO "AssetFamily" ("id", "code", "name", "createdAt")
SELECT gen_random_uuid(), UPPER("name"), "name", CURRENT_TIMESTAMP
FROM "Sku"
ON CONFLICT ("code") DO NOTHING;

UPDATE "Sku"
SET "assetFamilyId" = af."id"
FROM "AssetFamily" af
WHERE af."code" = UPPER("Sku"."name");

UPDATE "Asset"
SET "assetFamilyId" = "Sku"."assetFamilyId"
FROM "Sku"
WHERE "Asset"."skuId" = "Sku"."id";

WITH numbered AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "assetFamilyId"
           ORDER BY "createdAt" ASC, "serialOrEngine" ASC, "id" ASC
         ) AS rn
  FROM "Asset"
  WHERE "assetFamilyId" IS NOT NULL
)
UPDATE "Asset"
SET "internalNumber" = numbered.rn
FROM numbered
WHERE "Asset"."id" = numbered."id";

ALTER TABLE "Asset" ALTER COLUMN "assetFamilyId" SET NOT NULL;
ALTER TABLE "Asset" ALTER COLUMN "internalNumber" SET NOT NULL;

CREATE UNIQUE INDEX "Asset_assetFamilyId_internalNumber_key" ON "Asset"("assetFamilyId", "internalNumber");
