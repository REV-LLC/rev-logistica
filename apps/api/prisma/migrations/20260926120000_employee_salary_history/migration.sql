CREATE TABLE "EmployeeSalary" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "monthlySalary" DECIMAL(14,2) NOT NULL,
  "revision" INTEGER NOT NULL,
  "note" TEXT NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeSalary_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeSalary_amount_check" CHECK ("monthlySalary" > 0),
  CONSTRAINT "EmployeeSalary_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "EmployeeSalary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EmployeeSalary_employeeId_revision_key" ON "EmployeeSalary"("employeeId", "revision");
CREATE INDEX "EmployeeSalary_employeeId_effectiveFrom_revision_idx" ON "EmployeeSalary"("employeeId", "effectiveFrom", "revision");
-- Initial setup requested by REV. Historical pay before startup is not inferred.
INSERT INTO "EmployeeSalary" ("id", "employeeId", "effectiveFrom", "monthlySalary", "revision", "note")
SELECT 'initial-salary-' || "id", "id", DATE '2026-09-16', 1750905.00, 1,
  'Configuración inicial solicitada por REV: salario mínimo 2026, pendiente de ajustes individuales'
FROM "Employee";
