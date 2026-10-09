BEGIN;
ALTER TABLE "ImplementIdentityBridge" ALTER COLUMN "assetId" DROP NOT NULL;
ALTER TABLE "ImplementIdentityBridge" ADD COLUMN "skuId" TEXT REFERENCES "Sku"(id) ON DELETE RESTRICT;
ALTER TABLE "ImplementIdentityBridge" ADD CONSTRAINT "implement_native_identity"
CHECK (("assetId" IS NOT NULL) <> ("skuId" IS NOT NULL));
CREATE INDEX "ImplementIdentityBridge_skuId_idx" ON "ImplementIdentityBridge"("skuId");
CREATE FUNCTION assert_bulk_implement_bridge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."skuId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "StockLedger" l JOIN "Sku" s ON s.id=NEW."skuId"
    JOIN "AssetFamily" f ON f.id=s."assetFamilyId"
    JOIN "Accessory" a ON a.id=NEW."accessoryId"
    WHERE l.id=NEW."openingLedgerId" AND l."skuId"=NEW."skuId" AND l."assetId" IS NULL
      AND l."movementType"='ADJUST' AND l."isOpeningBalance" AND l.quantity>0
      AND l."refDocumentId" IS NULL AND l."refDocumentType" IS NULL
      AND l."warehouseId"=a."ownerWarehouseId" AND l."ownerWarehouseId"=a."ownerWarehouseId"
      AND l."customerWorksiteId" IS NULL AND l."reversedByDocumentId" IS NULL
      AND l."effectiveAt"=NEW."effectiveAt" AND f."controlType"='BULK'
      AND s."isImplement" AND NOT s."isConsumable"
      AND NEW."evidenceSnapshot"->>'schemaVersion'='2'
      AND NEW."evidenceSnapshot"->'before'->'source'->>'id'=a.id
      AND NEW."evidenceSnapshot"->'nativeSku'->>'id'=s.id
      AND (NEW."evidenceSnapshot"->>'reviewedQuantity')::numeric=l.quantity
  ) THEN RAISE EXCEPTION 'El empalme BULK requiere una apertura retornable revisada y consistente.'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER reviewed_bulk_implement_bridge
AFTER INSERT ON "ImplementIdentityBridge" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_bulk_implement_bridge();
CREATE FUNCTION preserve_bulk_implement_opening() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ImplementIdentityBridge" WHERE "openingLedgerId"=OLD.id AND "skuId"=OLD."skuId") THEN
    RAISE EXCEPTION 'La apertura del implemento BULK empalmado es histórica e inmutable.';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_bulk_implement_opening BEFORE UPDATE OR DELETE ON "StockLedger"
FOR EACH ROW WHEN (OLD."isOpeningBalance" AND OLD."skuId" IS NOT NULL)
EXECUTE FUNCTION preserve_bulk_implement_opening();
COMMIT;
