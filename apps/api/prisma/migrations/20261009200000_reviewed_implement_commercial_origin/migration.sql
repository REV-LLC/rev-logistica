CREATE TABLE "ImplementCommercialOriginReview" (
  "id" TEXT PRIMARY KEY,
  "bridgeId" TEXT NOT NULL UNIQUE REFERENCES "ImplementIdentityBridge"("id") ON DELETE RESTRICT,
  "parentOriginId" TEXT NOT NULL REFERENCES "LegacyEquipmentOrigin"("id") ON DELETE RESTRICT,
  "reviewedBy" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "evidenceSnapshot" JSONB NOT NULL
);
CREATE FUNCTION validate_implement_commercial_origin_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bridge "ImplementIdentityBridge"; origin "LegacyEquipmentOrigin"; ledger "StockLedger";
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'La revisión comercial del empalme es evidencia inmutable';
  END IF;
  SELECT * INTO STRICT bridge FROM "ImplementIdentityBridge" WHERE "id" = NEW."bridgeId";
  SELECT * INTO STRICT origin FROM "LegacyEquipmentOrigin" WHERE "id" = NEW."parentOriginId";
  SELECT * INTO STRICT ledger FROM "StockLedger" WHERE "id" = origin."sourceLedgerId";
  IF bridge."assetId" IS NULL OR ledger."reversedByDocumentId" IS NOT NULL
    OR origin."effectiveFrom" > bridge."effectiveAt"
    OR (NEW."evidenceSnapshot"->>'schemaVersion') IS DISTINCT FROM '1'
    OR (NEW."evidenceSnapshot"->>'bridgeId') IS DISTINCT FROM bridge."id"
    OR (NEW."evidenceSnapshot"->>'parentOriginId') IS DISTINCT FROM origin."id"
    OR (NEW."evidenceSnapshot"->>'sourceLedgerId') IS DISTINCT FROM ledger."id"
    OR (NEW."evidenceSnapshot"->>'assetId') IS DISTINCT FROM ledger."assetId"
    OR (NEW."evidenceSnapshot"->>'customerWorksiteId') IS DISTINCT FROM ledger."customerWorksiteId"
    OR (NEW."evidenceSnapshot"->>'ownerWarehouseId') IS DISTINCT FROM ledger."ownerWarehouseId"
    OR (bridge."evidenceSnapshot"#>>'{reviewedCustody,parentAssetId}') IS DISTINCT FROM ledger."assetId"
    OR (bridge."evidenceSnapshot"#>>'{reviewedCustody,customerWorksiteId}') IS DISTINCT FROM ledger."customerWorksiteId"
    OR (bridge."evidenceSnapshot"#>>'{reviewedCustody,ownerWarehouseId}') IS DISTINCT FROM ledger."ownerWarehouseId"
    OR length(trim(coalesce(NEW."evidenceSnapshot"->>'confirmation',''))) < 10
    OR NOT EXISTS (SELECT 1 FROM "User" WHERE "id"=NEW."reviewedBy" AND "active" AND "role" IN ('ADMIN','OFFICE'))
  THEN RAISE EXCEPTION 'La revisión requiere el origen exacto del equipo principal ya registrado'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER implement_commercial_origin_review_guard
BEFORE INSERT OR UPDATE OR DELETE ON "ImplementCommercialOriginReview"
FOR EACH ROW EXECUTE FUNCTION validate_implement_commercial_origin_review();
