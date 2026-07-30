ALTER TABLE "MaintenanceItem"
  ADD COLUMN "intervalDays" INTEGER,
  ADD COLUMN "warningDays" INTEGER,
  ADD COLUMN "baselineDate" TIMESTAMP(3);

ALTER TABLE "MaintenanceItem"
  ALTER COLUMN "intervalHours" DROP NOT NULL,
  ALTER COLUMN "warningHours" DROP NOT NULL,
  ALTER COLUMN "warningHours" DROP DEFAULT,
  ALTER COLUMN "baselineHours" DROP NOT NULL,
  ALTER COLUMN "baselineHours" DROP DEFAULT;

ALTER TABLE "MaintenanceCompletion"
  ALTER COLUMN "completedAtHours" DROP NOT NULL;

ALTER TABLE "MaintenanceItem"
  DROP CONSTRAINT "MaintenanceItem_interval_check",
  DROP CONSTRAINT "MaintenanceItem_warning_check",
  DROP CONSTRAINT "MaintenanceItem_baseline_check";

ALTER TABLE "MaintenanceCompletion"
  DROP CONSTRAINT "MaintenanceCompletion_hours_check";

UPDATE "MaintenanceItem" AS item
SET
  "intervalDays" = GREATEST(1, CEIL(item."intervalHours")::INTEGER),
  "warningDays" = GREATEST(0, CEIL(item."warningHours")::INTEGER),
  "baselineDate" = item."createdAt",
  "intervalHours" = NULL,
  "warningHours" = NULL,
  "baselineHours" = NULL
FROM "MaintenancePlan" AS plan
JOIN "Asset" AS asset ON asset."id" = plan."assetId"
JOIN "Sku" AS sku ON sku."id" = asset."skuId"
WHERE item."planId" = plan."id"
  AND sku."chargeType" = 'DAY';

UPDATE "MaintenanceCompletion" AS completion
SET "completedAtHours" = NULL
FROM "MaintenanceItem" AS item
JOIN "MaintenancePlan" AS plan ON plan."id" = item."planId"
JOIN "Asset" AS asset ON asset."id" = plan."assetId"
JOIN "Sku" AS sku ON sku."id" = asset."skuId"
WHERE completion."itemId" = item."id"
  AND sku."chargeType" = 'DAY';

ALTER TABLE "MaintenanceItem"
  ADD CONSTRAINT "MaintenanceItem_schedule_check" CHECK (
    (
      "intervalHours" > 0
      AND "warningHours" >= 0
      AND "baselineHours" >= 0
      AND "intervalDays" IS NULL
      AND "warningDays" IS NULL
      AND "baselineDate" IS NULL
    )
    OR
    (
      "intervalDays" > 0
      AND "warningDays" >= 0
      AND "baselineDate" IS NOT NULL
      AND "intervalHours" IS NULL
      AND "warningHours" IS NULL
      AND "baselineHours" IS NULL
    )
  ),
  ADD CONSTRAINT "MaintenanceItem_warning_days_check" CHECK (
    "warningDays" IS NULL OR "warningDays" >= 0
  );

ALTER TABLE "MaintenanceCompletion"
  ADD CONSTRAINT "MaintenanceCompletion_hours_check" CHECK (
    "completedAtHours" IS NULL OR "completedAtHours" >= 0
  );

DROP INDEX "MaintenanceCompletion_itemId_completedAtHours_idx";
CREATE INDEX "MaintenanceCompletion_itemId_completedAt_idx"
  ON "MaintenanceCompletion"("itemId", "completedAt" DESC);
