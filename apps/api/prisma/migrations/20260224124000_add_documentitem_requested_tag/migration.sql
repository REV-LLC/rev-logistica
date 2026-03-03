ALTER TABLE "DocumentItem"
  ADD COLUMN "requestedTag" TEXT;

CREATE INDEX IF NOT EXISTS "DocumentItem_requestedTag_idx" ON "DocumentItem"("requestedTag");
