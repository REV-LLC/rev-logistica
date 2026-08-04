ALTER TABLE "Document"
ADD COLUMN "recipientPhones" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Document"
SET "recipientPhones" = ARRAY["recipientPhone"]
WHERE "recipientPhone" IS NOT NULL;
