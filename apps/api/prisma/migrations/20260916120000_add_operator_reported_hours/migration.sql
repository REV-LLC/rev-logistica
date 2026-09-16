ALTER TABLE "AssetHourReading"
ADD COLUMN "previousHours" DECIMAL(12,2),
ADD COLUMN "operatorReportedHours" DECIMAL(12,2),
ADD CONSTRAINT "AssetHourReading_operatorReportedHours_check" CHECK ("operatorReportedHours" >= 0);

-- Preserve unknown initial readings and leave historical operator hours unreported.
WITH previous AS (
  SELECT "id", LAG("hours") OVER (
    PARTITION BY "assetId" ORDER BY "createdAt", "hours", "id"
  ) AS "hours"
  FROM "AssetHourReading"
)
UPDATE "AssetHourReading" AS reading
SET "previousHours" = previous."hours"
FROM previous
WHERE reading."id" = previous."id";
