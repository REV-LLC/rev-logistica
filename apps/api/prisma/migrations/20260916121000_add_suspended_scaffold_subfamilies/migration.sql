-- Dimensions belong to individual references; all six part types remain BULK.
INSERT INTO "AssetSubfamily" (
  "id", "assetFamilyId", "code", "name", "active", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  family."id",
  part.code,
  part.name,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "AssetFamily" family
CROSS JOIN (VALUES
  ('BARANDA', 'BARANDAS'),
  ('YOYO', 'YOYOS'),
  ('GRILLETE', 'GRILLETES'),
  ('PLATAFORMA_DE_APOYO', 'PLATAFORMAS DE APOYO'),
  ('PLATINA_EN_U', 'PLATINAS EN U'),
  ('TORNILLO', 'TORNILLOS')
) AS part(code, name)
WHERE family."code" = 'ANDAMIO_COLGANTE'
  AND family."controlType" = 'BULK'
ON CONFLICT ("assetFamilyId", "code") DO UPDATE
SET "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP;
