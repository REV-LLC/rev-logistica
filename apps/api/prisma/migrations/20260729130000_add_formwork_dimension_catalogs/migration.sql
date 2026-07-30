INSERT INTO "CatalogOption" ("id", "groupKey", "value", "label", "sortOrder")
VALUES
  (gen_random_uuid()::text, 'BULK_FORMWORK_WIDTHS', '0.10', '0.10', 10),
  (gen_random_uuid()::text, 'BULK_FORMWORK_WIDTHS', '0.15', '0.15', 20),
  (gen_random_uuid()::text, 'BULK_FORMWORK_WIDTHS', '0.20', '0.20', 30),
  (gen_random_uuid()::text, 'BULK_FORMWORK_WIDTHS', '0.25', '0.25', 40),
  (gen_random_uuid()::text, 'BULK_FORMWORK_WIDTHS', '0.30', '0.30', 50),
  (gen_random_uuid()::text, 'BULK_FORMWORK_WIDTHS', '0.35', '0.35', 60),
  (gen_random_uuid()::text, 'BULK_FORMWORK_WIDTHS', '0.40', '0.40', 70),
  (gen_random_uuid()::text, 'BULK_FORMWORK_WIDTHS', '0.45', '0.45', 80),
  (gen_random_uuid()::text, 'BULK_FORMWORK_WIDTHS', '0.50', '0.50', 90),
  (gen_random_uuid()::text, 'BULK_FORMWORK_WIDTHS', '0.60', '0.60', 100),
  (gen_random_uuid()::text, 'BULK_FORMWORK_HEIGHTS', '0.35', '0.35', 15),
  (gen_random_uuid()::text, 'BULK_FORMWORK_HEIGHTS', '0.50', '0.50', 20),
  (gen_random_uuid()::text, 'BULK_FORMWORK_HEIGHTS', '0.80', '0.80', 35)
ON CONFLICT ("groupKey", "value") DO NOTHING;
