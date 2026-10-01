CREATE TABLE "EmployeeSalary" (
 "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "effectiveFrom" DATE NOT NULL,
 "monthlySalary" DECIMAL(14,2) NOT NULL, "transportAllowance" DECIMAL(14,2) NOT NULL,
 "revision" INTEGER NOT NULL, "provisional" BOOLEAN NOT NULL DEFAULT false,
 "regime" TEXT NOT NULL DEFAULT 'STANDARD', "note" TEXT NOT NULL, "createdBy" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "EmployeeSalary_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "EmployeeSalary_amount_check" CHECK ("monthlySalary" > 0 AND "transportAllowance" >= 0),
 CONSTRAINT "EmployeeSalary_revision_check" CHECK ("revision" > 0),
 CONSTRAINT "EmployeeSalary_regime_check" CHECK ("regime" IN ('STANDARD', 'REVIEW_REQUIRED')),
 CONSTRAINT "EmployeeSalary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EmployeeSalary_employeeId_revision_key" ON "EmployeeSalary"("employeeId","revision");
CREATE INDEX "EmployeeSalary_employeeId_effectiveFrom_revision_idx" ON "EmployeeSalary"("employeeId","effectiveFrom","revision");
CREATE TABLE "PayrollReceipt" (
 "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "salaryId" TEXT NOT NULL,
 "periodFrom" DATE NOT NULL, "periodTo" DATE NOT NULL, "days" INTEGER NOT NULL,
 "idempotencyKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "snapshot" JSONB NOT NULL,
 "issuedBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PayrollReceipt_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PayrollReceipt_days_check" CHECK ("days" BETWEEN 1 AND 15),
 CONSTRAINT "PayrollReceipt_period_check" CHECK ("periodFrom" <= "periodTo"),
 CONSTRAINT "PayrollReceipt_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "PayrollReceipt_salaryId_fkey" FOREIGN KEY ("salaryId") REFERENCES "EmployeeSalary"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PayrollReceipt_idempotencyKey_key" ON "PayrollReceipt"("idempotencyKey");
CREATE UNIQUE INDEX "PayrollReceipt_employeeId_periodFrom_periodTo_key" ON "PayrollReceipt"("employeeId","periodFrom","periodTo");
CREATE INDEX "PayrollReceipt_employeeId_createdAt_idx" ON "PayrollReceipt"("employeeId","createdAt");
-- User-authorized provisional defaults, not a confirmation of actual historical pay.
-- They start on the module's initial effective date; earlier payroll is not inferred.
INSERT INTO "EmployeeSalary" ("id","employeeId","effectiveFrom","monthlySalary","transportAllowance","revision","provisional","note")
SELECT 'initial-salary-' || "id", "id", DATE '2026-10-01',1750905.00,249095.00,1,true,
 'Mínimo y auxilio 2026 provisionales. Confirmar condiciones individuales antes de emitir nómina.' FROM "Employee";
-- Append-only salary history and issued snapshots: corrections need an explicit future workflow.
CREATE FUNCTION payroll_prevent_history_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'El historial salarial y los comprobantes emitidos son inmutables'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "EmployeeSalary_immutable" BEFORE UPDATE OR DELETE ON "EmployeeSalary"
FOR EACH ROW EXECUTE FUNCTION payroll_prevent_history_mutation();
CREATE TRIGGER "PayrollReceipt_immutable" BEFORE UPDATE OR DELETE ON "PayrollReceipt"
FOR EACH ROW EXECUTE FUNCTION payroll_prevent_history_mutation();
