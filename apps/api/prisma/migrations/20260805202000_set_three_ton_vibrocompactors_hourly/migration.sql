-- Three-ton vibrocompactors are billed by the hour with the standard
-- six-hour minimum used by the existing hourly machinery catalog.
DO $$
BEGIN
  UPDATE "Sku" AS sku
  SET
    "chargeType" = 'HOUR',
    "minimumChargeHours" = 6
  FROM "AssetFamily" AS family
  JOIN "AssetSubfamily" AS subfamily
    ON subfamily."assetFamilyId" = family.id
  WHERE sku."assetFamilyId" = family.id
    AND sku."assetSubfamilyId" = subfamily.id
    AND regexp_replace(
      translate(upper(family.name), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
      '[^A-Z0-9]+',
      '',
      'g'
    ) = 'VIBROCOMPACTADOR'
    AND regexp_replace(
      translate(upper(subfamily.name), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
      '[^A-Z0-9]+',
      '',
      'g'
    ) = '3TONELADAS';

END $$;
