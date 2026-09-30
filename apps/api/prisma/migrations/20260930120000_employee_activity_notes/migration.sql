CREATE TABLE "EmployeeActivityNote" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "customerWorksiteId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "description" VARCHAR(5000) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeActivityNote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmployeeActivityNote_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EmployeeActivityNote_customerWorksiteId_fkey" FOREIGN KEY ("customerWorksiteId") REFERENCES "CustomerWorksite"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EmployeeActivityNote_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EmployeeActivityNote_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "EmployeeActivityNote_employeeId_date_idx" ON "EmployeeActivityNote"("employeeId", "date");
