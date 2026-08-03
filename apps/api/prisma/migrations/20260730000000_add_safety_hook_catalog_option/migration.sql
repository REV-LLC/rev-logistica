INSERT INTO "CatalogOption" ("id", "groupKey", "value", "label", "sortOrder")
VALUES
  (
    gen_random_uuid()::text,
    'BULK_CERTIFIED_SCAFFOLD_PARTS',
    'GANCHO DE SEGURIDAD',
    'GANCHO DE SEGURIDAD',
    140
  ),
  (
    gen_random_uuid()::text,
    'BULK_CERTIFIED_SCAFFOLD_WITHOUT_MEASURE',
    'GANCHO DE SEGURIDAD',
    'GANCHO DE SEGURIDAD',
    80
  )
ON CONFLICT ("groupKey", "value") DO NOTHING;
