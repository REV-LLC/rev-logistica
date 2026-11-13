ALTER TABLE "EmployeeActivityNote"
 ADD COLUMN "sourceAttendanceId" TEXT,
 ADD COLUMN "reviewStatus" TEXT,
 ADD COLUMN "systemSuggestion" VARCHAR(5000),
 ADD COLUMN "sourceInvalidatedAt" TIMESTAMP(3),
 ADD COLUMN "reviewedAt" TIMESTAMP(3),
 ADD COLUMN "reviewedByUserId" TEXT,
 ADD COLUMN "reviewedSourceExitId" TEXT,
 ADD COLUMN "verifiedEnteredAt" TIMESTAMP(3),
 ADD COLUMN "verifiedLeftAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "EmployeeActivityNote_sourceAttendanceId_key" ON "EmployeeActivityNote"("sourceAttendanceId");
ALTER TABLE "EmployeeActivityNote" ADD CONSTRAINT "EmployeeActivityNote_sourceAttendanceId_fkey" FOREIGN KEY ("sourceAttendanceId") REFERENCES "WorksiteAttendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeActivityNote" DROP CONSTRAINT "EmployeeActivityNote_associations_check";
ALTER TABLE "EmployeeActivityNote" ADD CONSTRAINT "EmployeeActivityNote_associations_check" CHECK (
 ("type"::text = 'WORKSITE' AND "customerWorksiteId" IS NOT NULL AND ("assetId" IS NOT NULL OR "sourceAttendanceId" IS NOT NULL) AND "warehouseId" IS NULL AND "endDate" IS NULL)
 OR ("type"::text = 'WAREHOUSE' AND "warehouseId" IS NOT NULL AND "customerWorksiteId" IS NULL AND "endDate" IS NULL)
 OR ("type"::text IN ('ABSENCE', 'MEDICAL_LEAVE', 'VACATION') AND "customerWorksiteId" IS NULL AND "assetId" IS NULL AND "warehouseId" IS NULL AND "endDate" IS NOT NULL)
);
ALTER TABLE "EmployeeActivityNote" ADD CONSTRAINT "EmployeeActivityNote_suggestion_check" CHECK (
 ("sourceAttendanceId" IS NULL AND "reviewStatus" IS NULL)
 OR ("sourceAttendanceId" IS NOT NULL AND "reviewStatus" IS NOT NULL AND "reviewStatus" IN ('SUGGESTED','CONFIRMED','CORRECTED','DISMISSED'))
);
CREATE TABLE "EmployeeActivityReview" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "noteId" TEXT NOT NULL,
 "action" TEXT NOT NULL,
 "previousData" JSONB NOT NULL,
 "nextData" JSONB NOT NULL,
 "userId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "EmployeeActivityReview_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "EmployeeActivityNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "EmployeeActivityReview_noteId_createdAt_idx" ON "EmployeeActivityReview"("noteId", "createdAt");

CREATE INDEX "WorksiteAttendance_enteredAt_idx" ON "WorksiteAttendance"("enteredAt");
