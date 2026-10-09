-- Both rows of a reviewed on-site opening are historical cutover evidence.
-- Later native remissions/returns append normal ledger rows instead.
BEGIN;

CREATE FUNCTION preserve_implement_opening() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ImplementIdentityBridge" bridge
    WHERE bridge."assetId" = OLD."assetId"
      AND (bridge."openingLedgerId" = OLD."id"
        OR bridge."evidenceSnapshot"->'openingLedgerIds' ? OLD."id")
  ) THEN
    RAISE EXCEPTION 'La apertura de un implemento empalmado es evidencia histórica y no se puede modificar ni eliminar.'
      USING ERRCODE = '23514', CONSTRAINT = 'immutable_implement_opening';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER immutable_implement_opening
BEFORE UPDATE OR DELETE ON "StockLedger"
FOR EACH ROW
WHEN (OLD."isOpeningBalance" AND OLD."assetId" IS NOT NULL)
EXECUTE FUNCTION preserve_implement_opening();

COMMIT;
