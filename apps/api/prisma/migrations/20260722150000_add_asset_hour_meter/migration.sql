ALTER TABLE "Asset"
ADD COLUMN "hourMeter" DECIMAL(12,2) NOT NULL DEFAULT 0;

UPDATE "Asset" AS asset
SET "hourMeter" = COALESCE((
  SELECT MAX(reading."hours")
  FROM "AssetHourReading" AS reading
  WHERE reading."assetId" = asset."id"
), 0);

ALTER TABLE "Asset"
ADD CONSTRAINT "Asset_hourMeter_check" CHECK ("hourMeter" >= 0);
