-- Office creates the individual references through the existing bulk catalogue.
-- All parts, including yoyos, are quantity-controlled. Platform length determines
-- the assembled scaffold's width; this family does not represent assembled stock.
INSERT INTO "AssetFamily" ("id", "code", "name", "controlType")
VALUES (
  gen_random_uuid()::text,
  'ANDAMIO_COLGANTE',
  'ANDAMIO COLGANTE',
  'BULK'
)
ON CONFLICT ("code") DO NOTHING;

-- Never silently convert an existing serialized family and its inventory.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "AssetFamily"
    WHERE "code" = 'ANDAMIO_COLGANTE' AND "controlType" <> 'BULK'
  ) THEN
    RAISE EXCEPTION 'ANDAMIO_COLGANTE already exists with a non-BULK control type';
  END IF;
END $$;
