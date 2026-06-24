CREATE TABLE "CatalogOption" (
  "id" TEXT NOT NULL,
  "groupKey" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CatalogOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogOption_groupKey_value_key" ON "CatalogOption"("groupKey", "value");
CREATE INDEX "CatalogOption_groupKey_idx" ON "CatalogOption"("groupKey");

INSERT INTO "CatalogOption" ("id", "groupKey", "value", "label", "sortOrder")
VALUES
  (gen_random_uuid()::text, 'BULK_FORMWORK_LINES', 'FORMALETA', 'FORMALETA', 10),
  (gen_random_uuid()::text, 'BULK_FORMWORK_LINES', 'FORMALETA_SARDINEL', 'FORMALETA SARDINEL', 20),
  (gen_random_uuid()::text, 'BULK_FORMWORK_HEIGHTS', '0.30', '0.30', 10),
  (gen_random_uuid()::text, 'BULK_FORMWORK_HEIGHTS', '0.60', '0.60', 20),
  (gen_random_uuid()::text, 'BULK_FORMWORK_HEIGHTS', '1.20', '1.20', 30),
  (gen_random_uuid()::text, 'BULK_FORMWORK_HEIGHTS', '2.40', '2.40', 40),
  (gen_random_uuid()::text, 'BULK_FORMWORK_HEIGHTS', '3.00', '3.00', 50),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_PARTS', 'VERTICALES', 'VERTICALES', 10),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_PARTS', 'HORIZONTALES', 'HORIZONTALES', 20),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_PARTS', 'BASE COLLAR', 'BASE COLLAR', 30),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_PARTS', 'RUEDAS NIVELADORAS', 'RUEDAS NIVELADORAS', 40),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_PARTS', 'TORNILLOS NIVELADORES', 'TORNILLOS NIVELADORES', 50),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_PARTS', 'PLATAFORMA', 'PLATAFORMA', 60),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_PARTS', 'ESCALERA PELDAÑO', 'ESCALERA PELDAÑO', 70),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_PARTS', 'ESCALERA TIPO GATO', 'ESCALERA TIPO GATO', 80),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_PARTS', 'DIAGONALES', 'DIAGONALES', 90),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_PARTS', 'RODA PIE', 'RODA PIE', 100),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_MEASURES', '0.50M', '0.50M', 10),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_MEASURES', '0.70M', '0.70M', 20),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_MEASURES', '1.00M', '1.00M', 30),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_MEASURES', '1.40M', '1.40M', 40),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_MEASURES', '2.00M', '2.00M', 50),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_MEASURES', '2.50M', '2.50M', 60),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_MEASURES', '3.00M', '3.00M', 70),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_WITHOUT_MEASURE', 'BASE COLLAR', 'BASE COLLAR', 10),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_WITHOUT_MEASURE', 'RUEDAS NIVELADORAS', 'RUEDAS NIVELADORAS', 20),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_WITHOUT_MEASURE', 'TORNILLOS NIVELADORES', 'TORNILLOS NIVELADORES', 30),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_WITHOUT_MEASURE', 'ESCALERA PELDAÑO', 'ESCALERA PELDAÑO', 40),
  (gen_random_uuid()::text, 'BULK_CERTIFIED_SCAFFOLD_WITHOUT_MEASURE', 'ESCALERA TIPO GATO', 'ESCALERA TIPO GATO', 50),
  (gen_random_uuid()::text, 'BULK_CONVENTIONAL_SCAFFOLD_PARTS', 'NAVE', 'NAVE', 10),
  (gen_random_uuid()::text, 'BULK_CONVENTIONAL_SCAFFOLD_PARTS', 'TIJERAS', 'TIJERAS', 20),
  (gen_random_uuid()::text, 'BULK_CONVENTIONAL_SCAFFOLD_PARTS', 'TUERCAS', 'TUERCAS', 30),
  (gen_random_uuid()::text, 'BULK_CONVENTIONAL_SCAFFOLD_PARTS', 'RUEDAS', 'RUEDAS', 40),
  (gen_random_uuid()::text, 'BULK_CONVENTIONAL_SCAFFOLD_PARTS', 'TABLONES', 'TABLONES', 50),
  (gen_random_uuid()::text, 'BULK_CONVENTIONAL_SCAFFOLD_PARTS', 'PLATAFORMAS', 'PLATAFORMAS', 60),
  (gen_random_uuid()::text, 'BULK_CONVENTIONAL_SCAFFOLD_MEASURES', '1.00M', '1.00M', 10),
  (gen_random_uuid()::text, 'BULK_CONVENTIONAL_SCAFFOLD_MEASURES', '1.50M', '1.50M', 20),
  (gen_random_uuid()::text, 'BULK_CONVENTIONAL_SCAFFOLD_WITH_MEASURE', 'NAVE', 'NAVE', 10),
  (gen_random_uuid()::text, 'BULK_CONVENTIONAL_SCAFFOLD_WITH_MEASURE', 'TIJERAS', 'TIJERAS', 20)
ON CONFLICT ("groupKey", "value") DO NOTHING;
