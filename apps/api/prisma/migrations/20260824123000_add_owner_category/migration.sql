CREATE TYPE "OwnerCategory" AS ENUM ('INTERNAL', 'PROVIDER');

ALTER TABLE "Owner"
ADD COLUMN "category" "OwnerCategory" NOT NULL DEFAULT 'PROVIDER';

UPDATE "Owner"
SET "category" = 'INTERNAL'
WHERE "id" IN (
  SELECT DISTINCT "ownerCompanyId"
  FROM "Warehouse"
  WHERE "type" = 'OWN'
);
