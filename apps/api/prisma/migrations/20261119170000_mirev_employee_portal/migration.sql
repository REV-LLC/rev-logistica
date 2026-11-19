ALTER TABLE "Employee" ADD COLUMN "eps" VARCHAR(160), ADD COLUMN "arl" VARCHAR(160);
CREATE TABLE "MiRevMedicalLeave" (
  "id" TEXT PRIMARY KEY, "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" TEXT NOT NULL, "clientRequestId" TEXT NOT NULL, "requestHash" TEXT NOT NULL,
  "day" DATE NOT NULL, "description" VARCHAR(500) NOT NULL,
  "providerType" TEXT NOT NULL CHECK ("providerType" IN ('EPS','ARL')), "providerName" VARCHAR(160),
  "latitude" DOUBLE PRECISION NOT NULL CHECK ("latitude" BETWEEN -90 AND 90),
  "longitude" DOUBLE PRECISION NOT NULL CHECK ("longitude" BETWEEN -180 AND 180),
  "accuracyMeters" DOUBLE PRECISION NOT NULL CHECK ("accuracyMeters" >= 0), "locationCapturedAt" TIMESTAMP(3) NOT NULL,
  "sourceEntryId" TEXT, "selfieKey" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "MiRevMedicalLeave_employeeId_clientRequestId_key" ON "MiRevMedicalLeave"("employeeId","clientRequestId");
CREATE UNIQUE INDEX "MiRevMedicalLeave_employeeId_day_key" ON "MiRevMedicalLeave"("employeeId","day");
CREATE TABLE "MiRevMedicalDiagnosis" (
  "id" TEXT PRIMARY KEY, "medicalLeaveId" TEXT NOT NULL REFERENCES "MiRevMedicalLeave"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" VARCHAR(180) NOT NULL, "mimeType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL,
  "evidenceKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MiRevMedicalDiagnosis_medicalLeaveId_idx" ON "MiRevMedicalDiagnosis"("medicalLeaveId");
