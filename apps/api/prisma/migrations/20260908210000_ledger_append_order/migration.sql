-- Add the nullable column BEFORE its default: never assign an invented order
-- to historical rows. PostgreSQL allocates a sequence value only on new writes.
ALTER TABLE "StockLedger" ADD COLUMN "appendOrder" INTEGER;
CREATE SEQUENCE "StockLedger_appendOrder_seq" AS INTEGER;
ALTER SEQUENCE "StockLedger_appendOrder_seq" OWNED BY "StockLedger"."appendOrder";
ALTER TABLE "StockLedger" ALTER COLUMN "appendOrder"
  SET DEFAULT nextval('"StockLedger_appendOrder_seq"'::regclass);
