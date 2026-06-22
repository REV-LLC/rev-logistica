ALTER TABLE "Task"
ADD COLUMN "assignedToEmployeeId" TEXT;

CREATE INDEX "Task_assignedToEmployeeId_idx" ON "Task"("assignedToEmployeeId");

ALTER TABLE "Task"
ADD CONSTRAINT "Task_assignedToEmployeeId_fkey"
FOREIGN KEY ("assignedToEmployeeId") REFERENCES "Employee"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
