INSERT INTO "CatalogOption" ("id", "groupKey", "value", "label", "sortOrder")
VALUES
  (
    gen_random_uuid()::text,
    'BULK_CERTIFIED_SCAFFOLD_PARTS',
    'TORNILLO PARA PLATINA EN U',
    'TORNILLO PARA PLATINA EN U',
    130
  ),
  (
    gen_random_uuid()::text,
    'BULK_CERTIFIED_SCAFFOLD_WITHOUT_MEASURE',
    'TORNILLO PARA PLATINA EN U',
    'TORNILLO PARA PLATINA EN U',
    70
  )
ON CONFLICT ("groupKey", "value") DO NOTHING;
