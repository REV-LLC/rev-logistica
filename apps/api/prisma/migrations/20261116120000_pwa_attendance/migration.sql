ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'EMPLOYEE';
ALTER TABLE "Project" ADD COLUMN "attendanceLatitude" DOUBLE PRECISION,
  ADD COLUMN "attendanceLongitude" DOUBLE PRECISION,
  ADD COLUMN "attendanceRadiusMeters" INTEGER NOT NULL DEFAULT 200;
ALTER TABLE "WorksiteAttendance" ALTER COLUMN "checkInReportId" DROP NOT NULL;
CREATE TABLE "EmployeeFaceReference" (
 "employeeId" TEXT PRIMARY KEY REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "vector" DOUBLE PRECISION[] NOT NULL,
 "modelVersion" TEXT NOT NULL,
 "photoHash" TEXT NOT NULL,
 "approvedByUserId" TEXT NOT NULL,
 "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "AttendancePunch" (
 "id" TEXT PRIMARY KEY,
 "requestId" TEXT NOT NULL UNIQUE,
 "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "customerWorksiteId" TEXT NOT NULL REFERENCES "CustomerWorksite"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "attendanceId" TEXT NOT NULL REFERENCES "WorksiteAttendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('CHECK_IN','CHECK_OUT')),
 "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdByUserId" TEXT NOT NULL,
 "latitude" DOUBLE PRECISION NOT NULL,
 "longitude" DOUBLE PRECISION NOT NULL,
 "accuracyMeters" DOUBLE PRECISION NOT NULL,
 "locationCapturedAt" TIMESTAMP(3) NOT NULL,
 "distanceMeters" DOUBLE PRECISION,
 "similarity" DOUBLE PRECISION,
 "threshold" DOUBLE PRECISION NOT NULL,
 "modelVersion" TEXT,
 "referencePhotoHash" TEXT,
 "evidenceKey" TEXT NOT NULL,
 "status" TEXT NOT NULL CHECK ("status" IN ('VERIFIED','PENDING','APPROVED','REJECTED')),
 "reasons" TEXT[] NOT NULL,
 "reviewedAt" TIMESTAMP(3),
 "reviewedByUserId" TEXT,
 "reviewNote" TEXT
);
CREATE INDEX "AttendancePunch_employeeId_occurredAt_idx" ON "AttendancePunch"("employeeId","occurredAt");
CREATE INDEX "AttendancePunch_status_occurredAt_idx" ON "AttendancePunch"("status","occurredAt");
