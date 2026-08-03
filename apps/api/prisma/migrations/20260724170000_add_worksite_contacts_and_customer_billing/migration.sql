ALTER TABLE "Customer"
ADD COLUMN "billingAddress" TEXT,
ADD COLUMN "billingPhone" TEXT,
ADD COLUMN "billingAlternatePhone" TEXT;

ALTER TABLE "Project"
ADD COLUMN "externalCode" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "alternatePhone" TEXT,
ADD COLUMN "email" TEXT;

CREATE UNIQUE INDEX "Project_externalCode_key"
ON "Project"("externalCode");
