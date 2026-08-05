-- Consolidate orthographic duplicates while preserving the family IDs that own
-- the real SKUs/assets. Counter values are merged with GREATEST so an internal
-- numbering sequence can never move backwards.
DO $$
DECLARE
  family_group RECORD;
  target_family_id TEXT;
  source_family RECORD;
  source_subfamily RECORD;
  target_subfamily_id TEXT;
  conflicting_skus INTEGER;
BEGIN
  FOR family_group IN
    SELECT *
    FROM (VALUES
      ('MINICARGADOR', 'MINI CARGADOR'),
      ('RETROEXCAVADORA', 'RETRO EXCAVADORA')
    ) AS groups(target_code, display_name)
  LOOP
    SELECT family."id"
    INTO target_family_id
    FROM "AssetFamily" family
    WHERE family."code" = family_group.target_code
      AND family."controlType" = 'SERIAL'
    LIMIT 1;

    IF target_family_id IS NULL THEN
      SELECT family."id"
      INTO target_family_id
      FROM "AssetFamily" family
      WHERE family."controlType" = 'SERIAL'
        AND regexp_replace(
          translate(upper(family."name"), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
          '[^A-Z0-9]+',
          '',
          'g'
        ) = regexp_replace(
          translate(upper(family_group.display_name), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
          '[^A-Z0-9]+',
          '',
          'g'
        )
      ORDER BY (
        SELECT count(*)
        FROM "Sku" sku
        WHERE sku."assetFamilyId" = family."id"
      ) DESC
      LIMIT 1;
    END IF;

    IF target_family_id IS NULL THEN
      CONTINUE;
    END IF;

    FOR source_family IN
      SELECT family."id", family."name"
      FROM "AssetFamily" family
      WHERE family."id" <> target_family_id
        AND family."controlType" = 'SERIAL'
        AND regexp_replace(
          translate(upper(family."name"), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
          '[^A-Z0-9]+',
          '',
          'g'
        ) = regexp_replace(
          translate(upper(family_group.display_name), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
          '[^A-Z0-9]+',
          '',
          'g'
        )
    LOOP
      SELECT count(*)
      INTO conflicting_skus
      FROM "Sku" source_sku
      JOIN "Sku" target_sku
        ON target_sku."assetFamilyId" = target_family_id
       AND upper(target_sku."name") = upper(source_sku."name")
      WHERE source_sku."assetFamilyId" = source_family."id";

      IF conflicting_skus > 0 THEN
        RAISE EXCEPTION
          'Cannot consolidate family %: % duplicate SKU names exist',
          source_family."name",
          conflicting_skus;
      END IF;

      FOR source_subfamily IN
        SELECT subfamily."id", subfamily."code", subfamily."name"
        FROM "AssetSubfamily" subfamily
        WHERE subfamily."assetFamilyId" = source_family."id"
      LOOP
        target_subfamily_id := NULL;

        SELECT subfamily."id"
        INTO target_subfamily_id
        FROM "AssetSubfamily" subfamily
        WHERE subfamily."assetFamilyId" = target_family_id
          AND (
            regexp_replace(
              translate(upper(subfamily."code"), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
              '[^A-Z0-9]+',
              '',
              'g'
            ) = regexp_replace(
              translate(upper(source_subfamily."code"), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
              '[^A-Z0-9]+',
              '',
              'g'
            )
            OR regexp_replace(
              translate(upper(subfamily."name"), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
              '[^A-Z0-9]+',
              '',
              'g'
            ) = regexp_replace(
              translate(upper(source_subfamily."name"), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
              '[^A-Z0-9]+',
              '',
              'g'
            )
          )
        LIMIT 1;

        IF target_subfamily_id IS NULL THEN
          UPDATE "AssetSubfamily"
          SET "assetFamilyId" = target_family_id,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = source_subfamily."id";

          UPDATE "Sku"
          SET "assetFamilyId" = target_family_id
          WHERE "assetSubfamilyId" = source_subfamily."id";
        ELSE
          INSERT INTO "AssetInternalCounter" (
            "id",
            "ownerWarehouseId",
            "assetSubfamilyId",
            "nextNumber",
            "createdAt",
            "updatedAt"
          )
          SELECT
            gen_random_uuid()::text,
            counter."ownerWarehouseId",
            target_subfamily_id,
            counter."nextNumber",
            counter."createdAt",
            CURRENT_TIMESTAMP
          FROM "AssetInternalCounter" counter
          WHERE counter."assetSubfamilyId" = source_subfamily."id"
          ON CONFLICT ("ownerWarehouseId", "assetSubfamilyId") DO UPDATE
          SET "nextNumber" = GREATEST(
                "AssetInternalCounter"."nextNumber",
                EXCLUDED."nextNumber"
              ),
              "updatedAt" = CURRENT_TIMESTAMP;

          UPDATE "Sku"
          SET "assetFamilyId" = target_family_id,
              "assetSubfamilyId" = target_subfamily_id
          WHERE "assetSubfamilyId" = source_subfamily."id";

          DELETE FROM "AssetInternalCounter"
          WHERE "assetSubfamilyId" = source_subfamily."id";

          DELETE FROM "AssetSubfamily"
          WHERE "id" = source_subfamily."id";
        END IF;
      END LOOP;

      UPDATE "Sku"
      SET "assetFamilyId" = target_family_id
      WHERE "assetFamilyId" = source_family."id";

      DELETE FROM "AssetFamily"
      WHERE "id" = source_family."id";
    END LOOP;

    UPDATE "AssetFamily"
    SET "name" = family_group.display_name
    WHERE "id" = target_family_id;

    target_family_id := NULL;
  END LOOP;
END $$;

-- Prevent future space, punctuation, accent, or casing variants from creating
-- a second family with the same operational identity.
CREATE UNIQUE INDEX "AssetFamily_controlType_normalized_name_key"
ON "AssetFamily" (
  "controlType",
  regexp_replace(
    translate(upper("name"), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
    '[^A-Z0-9]+',
    '',
    'g'
  )
);
