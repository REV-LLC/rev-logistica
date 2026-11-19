CREATE TABLE "MiRevFaceEnrollment" (
  "employeeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "photoHash" TEXT NOT NULL,
  "modelVersion" TEXT NOT NULL,
  "evidenceKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MiRevFaceEnrollment_pkey" PRIMARY KEY ("employeeId"),
  CONSTRAINT "MiRevFaceEnrollment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
