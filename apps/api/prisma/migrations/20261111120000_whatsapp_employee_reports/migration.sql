-- CreateEnum
CREATE TYPE "WhatsappReportKind" AS ENUM ('DAMAGE', 'HOUR_METER', 'REQUEST', 'CHECK_IN', 'CHECK_OUT');

-- CreateTable
CREATE TABLE "WhatsappInboundMessage" (
    "id" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "employeeId" TEXT,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "mediaId" TEXT,
    "evidenceFileObjectId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replyText" TEXT,
    "replySentAt" TIMESTAMP(3),
    "replyAttempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappInboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappConversation" (
    "phone" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "leaseUntil" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappConversation_pkey" PRIMARY KEY ("phone")
);

-- CreateTable
CREATE TABLE "WhatsappReport" (
    "id" TEXT NOT NULL,
    "kind" "WhatsappReportKind" NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assetId" TEXT,
    "vehicleId" TEXT,
    "customerWorksiteId" TEXT,
    "description" TEXT NOT NULL,
    "hours" DECIMAL(12,2),
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "sourceMessageIds" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappReportEvidence" (
    "reportId" TEXT NOT NULL,
    "fileObjectId" TEXT NOT NULL,

    CONSTRAINT "WhatsappReportEvidence_pkey" PRIMARY KEY ("reportId","fileObjectId")
);

-- CreateTable
CREATE TABLE "WorksiteAttendance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "customerWorksiteId" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),
    "checkInReportId" TEXT NOT NULL,
    "checkOutReportId" TEXT,

    CONSTRAINT "WorksiteAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappReportAlertRecipient" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "recipientKey" TEXT NOT NULL,
    "employeeId" TEXT,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "WhatsappReportAlertRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappInboundMessage_providerMessageId_key" ON "WhatsappInboundMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "WhatsappInboundMessage_status_nextAttemptAt_idx" ON "WhatsappInboundMessage"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WhatsappInboundMessage_phone_createdAt_idx" ON "WhatsappInboundMessage"("phone", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappReport_sourceMessageId_key" ON "WhatsappReport"("sourceMessageId");

-- CreateIndex
CREATE INDEX "WhatsappReport_employeeId_occurredAt_idx" ON "WhatsappReport"("employeeId", "occurredAt");

-- CreateIndex
CREATE INDEX "WhatsappReport_kind_createdAt_idx" ON "WhatsappReport"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsappReport_assetId_idx" ON "WhatsappReport"("assetId");

-- CreateIndex
CREATE INDEX "WhatsappReport_vehicleId_idx" ON "WhatsappReport"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "WorksiteAttendance_checkInReportId_key" ON "WorksiteAttendance"("checkInReportId");

-- CreateIndex
CREATE UNIQUE INDEX "WorksiteAttendance_checkOutReportId_key" ON "WorksiteAttendance"("checkOutReportId");

-- CreateIndex
CREATE INDEX "WorksiteAttendance_employeeId_enteredAt_idx" ON "WorksiteAttendance"("employeeId", "enteredAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappReportAlertRecipient_providerMessageId_key" ON "WhatsappReportAlertRecipient"("providerMessageId");

-- CreateIndex
CREATE INDEX "WhatsappReportAlertRecipient_status_nextAttemptAt_idx" ON "WhatsappReportAlertRecipient"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappReportAlertRecipient_reportId_recipientKey_key" ON "WhatsappReportAlertRecipient"("reportId", "recipientKey");

-- AddForeignKey
ALTER TABLE "WhatsappReport" ADD CONSTRAINT "WhatsappReport_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappReport" ADD CONSTRAINT "WhatsappReport_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappReport" ADD CONSTRAINT "WhatsappReport_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappReport" ADD CONSTRAINT "WhatsappReport_customerWorksiteId_fkey" FOREIGN KEY ("customerWorksiteId") REFERENCES "CustomerWorksite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappReportEvidence" ADD CONSTRAINT "WhatsappReportEvidence_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WhatsappReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappReportEvidence" ADD CONSTRAINT "WhatsappReportEvidence_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "FileObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorksiteAttendance" ADD CONSTRAINT "WorksiteAttendance_checkInReportId_fkey" FOREIGN KEY ("checkInReportId") REFERENCES "WhatsappReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorksiteAttendance" ADD CONSTRAINT "WorksiteAttendance_checkOutReportId_fkey" FOREIGN KEY ("checkOutReportId") REFERENCES "WhatsappReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorksiteAttendance" ADD CONSTRAINT "WorksiteAttendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorksiteAttendance" ADD CONSTRAINT "WorksiteAttendance_customerWorksiteId_fkey" FOREIGN KEY ("customerWorksiteId") REFERENCES "CustomerWorksite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappReportAlertRecipient" ADD CONSTRAINT "WhatsappReportAlertRecipient_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WhatsappReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "WorksiteAttendance_one_open_per_employee" ON "WorksiteAttendance" ("employeeId") WHERE "leftAt" IS NULL;
