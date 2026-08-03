INSERT INTO "CatalogOption" ("id", "groupKey", "value", "label", "sortOrder")
VALUES
  (
    gen_random_uuid()::text,
    'BULK_CERTIFIED_SCAFFOLD_PARTS',
    'PASAMANOS PARA ESCALERA',
    'PASAMANOS PARA ESCALERA',
    110
  ),
  (
    gen_random_uuid()::text,
    'BULK_CERTIFIED_SCAFFOLD_WITHOUT_MEASURE',
    'PASAMANOS PARA ESCALERA',
    'PASAMANOS PARA ESCALERA',
    60
  )
ON CONFLICT ("groupKey", "value") DO NOTHING;
