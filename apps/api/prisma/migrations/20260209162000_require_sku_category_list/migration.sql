UPDATE "Sku"
SET "category" = UPPER(TRIM("category"))
WHERE "category" IS NOT NULL;

UPDATE "Sku"
SET "category" = 'SIN_CATEGORIA'
WHERE "category" IS NULL
   OR BTRIM("category") = ''
   OR "category" NOT IN (
     'FORMALETA',
     'COMPACTADORES',
     'HERRAMIENTAS ELECTRICAS DE PERCUSION',
     'HERRAMIENTAS NEUMATICAS',
     'MAQUINARIA AMARILLA',
     'DEMOLICION',
     'ENCOFRADO',
     'ALTURAS',
     'ANDAMIOS',
     'SIN_CATEGORIA'
   );

ALTER TABLE "Sku"
  ALTER COLUMN "category" SET NOT NULL;

ALTER TABLE "Sku"
  DROP CONSTRAINT IF EXISTS "Sku_category_check";

ALTER TABLE "Sku"
  ADD CONSTRAINT "Sku_category_check"
  CHECK (
    "category" IN (
      'FORMALETA',
      'COMPACTADORES',
      'HERRAMIENTAS ELECTRICAS DE PERCUSION',
      'HERRAMIENTAS NEUMATICAS',
      'MAQUINARIA AMARILLA',
      'DEMOLICION',
      'ENCOFRADO',
      'ALTURAS',
      'ANDAMIOS',
      'SIN_CATEGORIA'
    )
  );
