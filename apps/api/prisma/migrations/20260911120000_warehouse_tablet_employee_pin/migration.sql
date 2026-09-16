ALTER TYPE "Role" ADD VALUE 'WAREHOUSE_TABLET';

ALTER TABLE "User" ADD COLUMN "warehouseId" TEXT,
ADD COLUMN "pinAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "pinWindowEndsAt" TIMESTAMP(3);
CREATE TABLE "EmployeeTabletPin" (
  "employeeId" TEXT NOT NULL,
  "pinHash" TEXT NOT NULL,
  "lookup" TEXT NOT NULL,
  CONSTRAINT "EmployeeTabletPin_pkey" PRIMARY KEY ("employeeId")
);
CREATE UNIQUE INDEX "EmployeeTabletPin_lookup_key" ON "EmployeeTabletPin"("lookup");
ALTER TABLE "EmployeeTabletPin" ADD CONSTRAINT "EmployeeTabletPin_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TabletDocumentAuthorization" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TabletDocumentAuthorization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TabletDocumentAuthorization_tokenHash_key" ON "TabletDocumentAuthorization"("tokenHash");
CREATE INDEX "TabletDocumentAuthorization_userId_expiresAt_idx" ON "TabletDocumentAuthorization"("userId", "expiresAt");
ALTER TABLE "TabletDocumentAuthorization" ADD CONSTRAINT "TabletDocumentAuthorization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TabletDocumentAuthorization" ADD CONSTRAINT "TabletDocumentAuthorization_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Document" ADD COLUMN "performedByEmployeeId" TEXT,
ADD COLUMN "performedByEmployeeName" TEXT,
ADD COLUMN "tabletAuthorizationId" TEXT;
CREATE UNIQUE INDEX "Document_tabletAuthorizationId_key" ON "Document"("tabletAuthorizationId");
ALTER TABLE "Document" ADD CONSTRAINT "Document_performedByEmployeeId_fkey" FOREIGN KEY ("performedByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_tabletAuthorizationId_fkey" FOREIGN KEY ("tabletAuthorizationId") REFERENCES "TabletDocumentAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
