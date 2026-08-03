CREATE TYPE "CustomerIdentityDocumentType" AS ENUM ('NIT', 'CC');

ALTER TABLE "Customer"
ADD COLUMN "identityDocumentType" "CustomerIdentityDocumentType";

CREATE UNIQUE INDEX "Customer_identityDocumentType_nitOrId_key"
ON "Customer"("identityDocumentType", "nitOrId");
