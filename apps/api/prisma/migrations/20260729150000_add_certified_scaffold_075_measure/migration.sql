INSERT INTO "CatalogOption" ("id", "groupKey", "value", "label", "sortOrder")
VALUES (
  gen_random_uuid()::text,
  'BULK_CERTIFIED_SCAFFOLD_MEASURES',
  '0.75M',
  '0.75M',
  25
)
ON CONFLICT ("groupKey", "value") DO NOTHING;
