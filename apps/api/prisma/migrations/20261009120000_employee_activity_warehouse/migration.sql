ALTER TYPE "EmployeeActivityType" ADD VALUE 'WAREHOUSE';
ALTER TABLE "EmployeeActivityNote" ADD COLUMN "warehouseId" TEXT;
ALTER TABLE "EmployeeActivityNote" ADD CONSTRAINT "EmployeeActivityNote_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeActivityNote" DROP CONSTRAINT "EmployeeActivityNote_associations_check";
ALTER TABLE "EmployeeActivityNote" ADD CONSTRAINT "EmployeeActivityNote_associations_check" CHECK (
  ("type"::text = 'WORKSITE' AND "customerWorksiteId" IS NOT NULL AND "assetId" IS NOT NULL AND "warehouseId" IS NULL AND "endDate" IS NULL)
  OR ("type"::text = 'WAREHOUSE' AND "warehouseId" IS NOT NULL AND "customerWorksiteId" IS NULL AND "endDate" IS NULL)
  OR ("type"::text IN ('ABSENCE', 'MEDICAL_LEAVE', 'VACATION') AND "customerWorksiteId" IS NULL AND "assetId" IS NULL AND "warehouseId" IS NULL AND "endDate" IS NOT NULL)
);
