-- Add an explicit personnel-document relation without changing existing files or evidence.
CREATE TABLE "EmployeeDocument" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "fileObjectId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmployeeDocument_fileObjectId_key" ON "EmployeeDocument"("fileObjectId");
CREATE INDEX "EmployeeDocument_employeeId_createdAt_idx" ON "EmployeeDocument"("employeeId", "createdAt");
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES "FileObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only positively classified personnel documents. Preserve all legacy metadata/keys.
INSERT INTO "EmployeeDocument" ("id", "employeeId", "fileObjectId", "createdAt")
SELECT f."id", e."id", f."id", f."createdAt"
FROM "FileObject" f JOIN "Employee" e ON e."id" = f."entityId"
WHERE f."entityType" = 'EMPLOYEE'
  AND f."category" IN ('HOJA_VIDA','CEDULA','ARL','EPS','CURSO_ALTURAS','CONTRATO','CERTIFICADO','OTRO')
  AND f."fileType" <> 'EVIDENCIA_WHATSAPP'
  AND NOT EXISTS (SELECT 1 FROM "WhatsappReportEvidence" w WHERE w."fileObjectId" = f."id")
  AND NOT EXISTS (SELECT 1 FROM "WhatsappInboundMessage" w WHERE w."evidenceFileObjectId" = f."id");
