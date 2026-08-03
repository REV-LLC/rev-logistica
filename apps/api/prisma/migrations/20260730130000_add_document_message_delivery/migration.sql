ALTER TABLE "Document"
ADD COLUMN "shareToken" TEXT,
ADD COLUMN "recipientPhone" TEXT;

UPDATE "Document"
SET "shareToken" = gen_random_uuid()::text
WHERE "shareToken" IS NULL;

ALTER TABLE "Document"
ALTER COLUMN "shareToken" SET NOT NULL,
ALTER COLUMN "shareToken" SET DEFAULT gen_random_uuid()::text;

CREATE UNIQUE INDEX "Document_shareToken_key" ON "Document"("shareToken");

CREATE TABLE "DocumentMessageDelivery" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "phone" TEXT NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "sentAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentMessageDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentMessageDelivery_documentId_kind_channel_phone_key"
ON "DocumentMessageDelivery"("documentId", "kind", "channel", "phone");

CREATE INDEX "DocumentMessageDelivery_documentId_status_idx"
ON "DocumentMessageDelivery"("documentId", "status");

ALTER TABLE "DocumentMessageDelivery"
ADD CONSTRAINT "DocumentMessageDelivery_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "Document"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
