CREATE TYPE "EmployeeActivityType" AS ENUM ('WORKSITE', 'ABSENCE', 'MEDICAL_LEAVE', 'VACATION');
ALTER TABLE "EmployeeActivityNote"
  ADD COLUMN "type" "EmployeeActivityType" NOT NULL DEFAULT 'WORKSITE',
  ADD COLUMN "endDate" DATE,
  ALTER COLUMN "customerWorksiteId" DROP NOT NULL,
  ALTER COLUMN "assetId" DROP NOT NULL;
ALTER TABLE "EmployeeActivityNote"
  ADD CONSTRAINT "EmployeeActivityNote_date_range_check" CHECK ("endDate" IS NULL OR "endDate" >= "date"),
  ADD CONSTRAINT "EmployeeActivityNote_associations_check" CHECK (
    ("type" = 'WORKSITE' AND "customerWorksiteId" IS NOT NULL AND "assetId" IS NOT NULL AND "endDate" IS NULL)
    OR ("type" <> 'WORKSITE' AND "customerWorksiteId" IS NULL AND "assetId" IS NULL AND "endDate" IS NOT NULL)
  );
