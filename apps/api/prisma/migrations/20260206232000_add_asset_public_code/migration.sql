ALTER TABLE "Asset" ADD COLUMN "publicCode" TEXT;

UPDATE "Asset"
SET "publicCode" = af."code" || '-' || UPPER(SUBSTRING(a."warehouseOwnerId" FROM 1 FOR 4)) || '-' || LPAD(a."internalNumber"::text, 4, '0')
FROM "Asset" a
JOIN "AssetFamily" af ON af."id" = a."assetFamilyId"
WHERE "Asset"."id" = a."id"
  AND "Asset"."publicCode" IS NULL;

ALTER TABLE "Asset" ALTER COLUMN "publicCode" SET NOT NULL;

CREATE UNIQUE INDEX "Asset_publicCode_key" ON "Asset"("publicCode");
