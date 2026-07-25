CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

CREATE TABLE "AssetHourReading" (
  "id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "hours" DECIMAL(12,2) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "note" TEXT,
  "recordedByUserId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetHourReading_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssetHourReading_hours_check" CHECK ("hours" >= 0)
);

CREATE TABLE "VehicleHourReading" (
  "id" TEXT NOT NULL, "vehicleId" TEXT NOT NULL, "hours" DECIMAL(12,2) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "note" TEXT,
  "recordedByUserId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleHourReading_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VehicleHourReading_hours_check" CHECK ("hours" >= 0)
);

CREATE TABLE "MaintenancePlan" (
  "id" TEXT NOT NULL, "assetId" TEXT, "vehicleId" TEXT, "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "MaintenancePlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenancePlan_subject_check" CHECK (num_nonnulls("assetId", "vehicleId") = 1)
);

CREATE TABLE "MaintenanceItem" (
  "id" TEXT NOT NULL, "planId" TEXT NOT NULL, "name" TEXT NOT NULL, "instructions" TEXT,
  "intervalHours" DECIMAL(12,2) NOT NULL, "warningHours" DECIMAL(12,2) NOT NULL DEFAULT 10,
  "baselineHours" DECIMAL(12,2) NOT NULL DEFAULT 0, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaintenanceItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceItem_interval_check" CHECK ("intervalHours" > 0),
  CONSTRAINT "MaintenanceItem_warning_check" CHECK ("warningHours" >= 0),
  CONSTRAINT "MaintenanceItem_baseline_check" CHECK ("baselineHours" >= 0)
);

CREATE TABLE "MaintenanceCompletion" (
  "id" TEXT NOT NULL, "itemId" TEXT NOT NULL, "completedAtHours" DECIMAL(12,2) NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "notes" TEXT,
  "completedByUserId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceCompletion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceCompletion_hours_check" CHECK ("completedAtHours" >= 0)
);

CREATE TABLE "NotificationTopic" (
  "id" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL, "eventType" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, "titleTemplate" TEXT, "messageTemplate" TEXT,
  "dueAt" TIMESTAMP(3), "warningDays" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "NotificationTopic_pkey" PRIMARY KEY ("id")
  ,CONSTRAINT "NotificationTopic_warning_days_check" CHECK ("warningDays" IS NULL OR "warningDays" >= 0)
);

CREATE TABLE "NotificationRecipient" (
  "id" TEXT NOT NULL, "topicId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT true, "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL, "topicId" TEXT NOT NULL, "userId" TEXT NOT NULL, "occurrenceKey" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL, "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "sentAt" TIMESTAMP(3), "error" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssetHourReading_assetId_hours_idx" ON "AssetHourReading"("assetId", "hours" DESC);
CREATE INDEX "AssetHourReading_recordedByUserId_idx" ON "AssetHourReading"("recordedByUserId");
CREATE INDEX "VehicleHourReading_vehicleId_hours_idx" ON "VehicleHourReading"("vehicleId", "hours" DESC);
CREATE INDEX "VehicleHourReading_recordedByUserId_idx" ON "VehicleHourReading"("recordedByUserId");
CREATE INDEX "MaintenancePlan_assetId_active_idx" ON "MaintenancePlan"("assetId", "active");
CREATE INDEX "MaintenancePlan_vehicleId_active_idx" ON "MaintenancePlan"("vehicleId", "active");
CREATE INDEX "MaintenanceItem_planId_active_idx" ON "MaintenanceItem"("planId", "active");
CREATE INDEX "MaintenanceCompletion_itemId_completedAtHours_idx" ON "MaintenanceCompletion"("itemId", "completedAtHours" DESC);
CREATE INDEX "MaintenanceCompletion_completedByUserId_idx" ON "MaintenanceCompletion"("completedByUserId");
CREATE UNIQUE INDEX "NotificationTopic_entityType_entityId_eventType_key" ON "NotificationTopic"("entityType", "entityId", "eventType");
CREATE INDEX "NotificationTopic_entityType_entityId_active_idx" ON "NotificationTopic"("entityType", "entityId", "active");
CREATE INDEX "NotificationTopic_active_dueAt_idx" ON "NotificationTopic"("active", "dueAt");
CREATE UNIQUE INDEX "NotificationRecipient_topicId_userId_key" ON "NotificationRecipient"("topicId", "userId");
CREATE INDEX "NotificationRecipient_userId_topicId_idx" ON "NotificationRecipient"("userId", "topicId");
CREATE UNIQUE INDEX "NotificationDelivery_topicId_userId_occurrenceKey_channel_key" ON "NotificationDelivery"("topicId", "userId", "occurrenceKey", "channel");
CREATE INDEX "NotificationDelivery_userId_status_idx" ON "NotificationDelivery"("userId", "status");

ALTER TABLE "AssetHourReading" ADD CONSTRAINT "AssetHourReading_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetHourReading" ADD CONSTRAINT "AssetHourReading_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleHourReading" ADD CONSTRAINT "VehicleHourReading_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VehicleHourReading" ADD CONSTRAINT "VehicleHourReading_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceItem" ADD CONSTRAINT "MaintenanceItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MaintenancePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceCompletion" ADD CONSTRAINT "MaintenanceCompletion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MaintenanceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceCompletion" ADD CONSTRAINT "MaintenanceCompletion_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "NotificationTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "NotificationTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every existing vehicle receives its mandatory document topics automatically.
INSERT INTO "NotificationTopic" ("id", "entityType", "entityId", "eventType", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'VEHICLE', "id", event_type, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Vehicle" CROSS JOIN (VALUES ('SOAT_EXPIRY'), ('TECH_INSPECTION_EXPIRY')) AS required_topics(event_type);
