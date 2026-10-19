CREATE TABLE "EmployeeLoanDescriptionRevision" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "beforeDetail" TEXT NOT NULL,
  "afterDetail" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeLoanDescriptionRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeLoanDescriptionRevision_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "EmployeeLoanEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmployeeLoanDescriptionRevision_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "EmployeeLoanDescriptionRevision_entryId_createdAt_idx"
  ON "EmployeeLoanDescriptionRevision"("entryId", "createdAt");
