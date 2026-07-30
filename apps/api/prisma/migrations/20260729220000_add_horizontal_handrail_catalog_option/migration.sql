INSERT INTO "CatalogOption" ("id", "groupKey", "value", "label", "sortOrder")
VALUES (
  gen_random_uuid()::text,
  'BULK_CERTIFIED_SCAFFOLD_PARTS',
  'PASAMANOS HORIZONTAL',
  'PASAMANOS HORIZONTAL',
  120
)
ON CONFLICT ("groupKey", "value") DO NOTHING;
