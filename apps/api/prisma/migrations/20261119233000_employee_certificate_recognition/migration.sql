-- CreateTable
CREATE TABLE "EmployeeAffiliationRecognition" (
    "id" TEXT NOT NULL,
    "employeeDocumentId" TEXT,
    "employeeId" TEXT NOT NULL,
    "sourceFileObjectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "candidateProviderId" TEXT,
    "expectedProviderId" TEXT,
    "previousProviderId" TEXT,
    "identityVerified" BOOLEAN NOT NULL DEFAULT false,
    "issuedAt" DATE,
    "readerMethod" TEXT,
    "recognizerVersion" TEXT NOT NULL DEFAULT 'local-v1',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAffiliationRecognition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAffiliationRecognition_employeeDocumentId_key" ON "EmployeeAffiliationRecognition"("employeeDocumentId");

-- CreateIndex
CREATE INDEX "EmployeeAffiliationRecognition_status_leaseUntil_createdAt_idx" ON "EmployeeAffiliationRecognition"("status", "leaseUntil", "createdAt");

-- CreateIndex
CREATE INDEX "EmployeeAffiliationRecognition_employeeId_createdAt_idx" ON "EmployeeAffiliationRecognition"("employeeId", "createdAt");

-- AddForeignKey
ALTER TABLE "EmployeeAffiliationRecognition" ADD CONSTRAINT "EmployeeAffiliationRecognition_employeeDocumentId_fkey" FOREIGN KEY ("employeeDocumentId") REFERENCES "EmployeeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAffiliationRecognition" ADD CONSTRAINT "EmployeeAffiliationRecognition_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAffiliationRecognition" ADD CONSTRAINT "EmployeeAffiliationRecognition_candidateProviderId_fkey" FOREIGN KEY ("candidateProviderId") REFERENCES "EmployeeAffiliationProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "EmployeeAffiliationRecognition" ADD CONSTRAINT "EmployeeAffiliationRecognition_kind_check" CHECK (kind IN ('EPS','ARL'));
ALTER TABLE "EmployeeAffiliationRecognition" ADD CONSTRAINT "EmployeeAffiliationRecognition_status_check" CHECK (status IN ('PENDING','PROCESSING','REVIEW','APPLIED','DISMISSED'));
