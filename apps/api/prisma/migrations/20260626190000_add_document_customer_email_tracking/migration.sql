ALTER TABLE "Document" ADD COLUMN "officeModifiedAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN "officeModifiedBy" TEXT;
ALTER TABLE "Document" ADD COLUMN "customerDraftEmailedAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN "customerFinalEmailedAt" TIMESTAMP(3);
