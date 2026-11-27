ALTER TABLE "WhatsappInboundMessage" ADD COLUMN "mediaFilename" TEXT;
CREATE TABLE "WhatsappOfficeMessage" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "phoneNumberId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SENDING',
  "providerMessageId" TEXT,
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsappOfficeMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WhatsappOfficeMessage_status_check" CHECK ("status" IN ('SENDING','SENT','DELIVERED','READ','FAILED','UNCERTAIN')),
  CONSTRAINT "WhatsappOfficeMessage_text_check" CHECK (length("text") BETWEEN 1 AND 4000)
);
CREATE UNIQUE INDEX "WhatsappOfficeMessage_providerMessageId_key" ON "WhatsappOfficeMessage"("providerMessageId");
CREATE INDEX "WhatsappOfficeMessage_phone_createdAt_id_idx" ON "WhatsappOfficeMessage"("phone","createdAt","id");
ALTER TABLE "WhatsappOfficeMessage" ADD CONSTRAINT "WhatsappOfficeMessage_phone_fkey" FOREIGN KEY ("phone") REFERENCES "WhatsappCustomerChat"("phone") ON DELETE RESTRICT ON UPDATE CASCADE;
