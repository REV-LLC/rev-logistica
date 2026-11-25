ALTER TABLE "WhatsappCustomerChat"
 ADD COLUMN "contactName" TEXT,
 ADD COLUMN "customerId" TEXT,
 ADD COLUMN "customerWorksiteId" TEXT,
 ADD COLUMN "profileVersion" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "profileUpdatedBy" TEXT,
 ADD COLUMN "profileUpdatedAt" TIMESTAMP(3);
ALTER TABLE "WhatsappCustomerRequest"
 ADD COLUMN "customerId" TEXT,
 ADD COLUMN "customerWorksiteId" TEXT,
 ADD COLUMN "linkedContactName" TEXT,
 ADD COLUMN "linkedCustomerName" TEXT,
 ADD COLUMN "linkedWorksiteName" TEXT,
 ADD COLUMN "linkedBy" TEXT,
 ADD COLUMN "linkedAt" TIMESTAMP(3);
ALTER TABLE "WhatsappCustomerChat"
 ADD CONSTRAINT "WhatsappCustomerChat_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 ADD CONSTRAINT "WhatsappCustomerChat_customerWorksiteId_fkey" FOREIGN KEY ("customerWorksiteId") REFERENCES "CustomerWorksite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsappCustomerRequest"
 ADD CONSTRAINT "WhatsappCustomerRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 ADD CONSTRAINT "WhatsappCustomerRequest_customerWorksiteId_fkey" FOREIGN KEY ("customerWorksiteId") REFERENCES "CustomerWorksite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "WhatsappCustomerChat_customerId_idx" ON "WhatsappCustomerChat"("customerId");
CREATE INDEX "WhatsappCustomerChat_customerWorksiteId_idx" ON "WhatsappCustomerChat"("customerWorksiteId");
CREATE INDEX "WhatsappCustomerRequest_customerId_idx" ON "WhatsappCustomerRequest"("customerId");
CREATE INDEX "WhatsappCustomerRequest_customerWorksiteId_idx" ON "WhatsappCustomerRequest"("customerWorksiteId");
