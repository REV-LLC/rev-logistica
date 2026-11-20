CREATE TABLE "WhatsappCustomerChat" (
 "phone" TEXT NOT NULL PRIMARY KEY,
 "draft" JSONB NOT NULL,
 "lastCustomerAt" TIMESTAMP(3),
 "confirmationMessageId" TEXT,
 "awaitingConfirmation" BOOLEAN NOT NULL DEFAULT false,
 "paused" BOOLEAN NOT NULL DEFAULT false,
 "reviewedThrough" TIMESTAMP(3),
 "reviewedBy" TEXT,
 "notes" TEXT NOT NULL DEFAULT '',
 "leaseUntil" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseToken" TEXT,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "WhatsappCustomerRequest" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "phone" TEXT NOT NULL,
 "sourceMessageId" TEXT NOT NULL,
 "details" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "WhatsappCustomerRequest_phone_fkey" FOREIGN KEY ("phone") REFERENCES "WhatsappCustomerChat"("phone") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WhatsappCustomerRequest_sourceMessageId_key" ON "WhatsappCustomerRequest"("sourceMessageId");
CREATE INDEX "WhatsappCustomerRequest_phone_createdAt_idx" ON "WhatsappCustomerRequest"("phone", "createdAt");
