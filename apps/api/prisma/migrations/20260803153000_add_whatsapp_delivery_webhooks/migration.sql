ALTER TYPE "NotificationDeliveryStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';
ALTER TYPE "NotificationDeliveryStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "NotificationDeliveryStatus" ADD VALUE IF NOT EXISTS 'READ';

ALTER TABLE "NotificationDelivery"
  ADD COLUMN "providerMessageId" TEXT,
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "readAt" TIMESTAMP(3);

ALTER TABLE "DocumentMessageDelivery"
  ADD COLUMN "providerMessageId" TEXT,
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "readAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "NotificationDelivery_providerMessageId_key"
  ON "NotificationDelivery"("providerMessageId");

CREATE UNIQUE INDEX "DocumentMessageDelivery_providerMessageId_key"
  ON "DocumentMessageDelivery"("providerMessageId");
