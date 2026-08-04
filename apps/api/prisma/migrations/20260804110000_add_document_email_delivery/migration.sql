-- CreateTable
CREATE TABLE "DocumentEmailDelivery" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "attachmentNames" JSONB NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentEmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentEmailDelivery_documentId_kind_key" ON "DocumentEmailDelivery"("documentId", "kind");

-- CreateIndex
CREATE INDEX "DocumentEmailDelivery_status_createdAt_idx" ON "DocumentEmailDelivery"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DocumentEmailDelivery_documentId_createdAt_idx" ON "DocumentEmailDelivery"("documentId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "DocumentEmailDelivery" ADD CONSTRAINT "DocumentEmailDelivery_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
