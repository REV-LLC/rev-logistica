ALTER TABLE "WhatsappInboundMessage"
  ADD COLUMN "selectionId" TEXT,
  ADD COLUMN "replyKind" TEXT NOT NULL DEFAULT 'TEXT';
