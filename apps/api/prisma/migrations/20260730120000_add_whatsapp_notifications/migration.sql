ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'WHATSAPP';

ALTER TABLE "NotificationRecipient"
ADD COLUMN "whatsappEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "NotificationRecipient"
ALTER COLUMN "emailEnabled" SET DEFAULT false;

UPDATE "NotificationRecipient"
SET "emailEnabled" = false,
    "smsEnabled" = false;
