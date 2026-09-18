-- Recover damage from confirmed returns that predate condition tracking.
-- Use the actual receipt timestamp and operator, not the editable document date.
-- Never override a condition decision recorded at or after that receipt.
WITH reports AS (
  SELECT DISTINCT ON (i."assetId")
    i."id", i."assetId", btrim(i."conditionNote") AS note,
    receipt."createdAt", receipt."createdBy"
  FROM "DocumentItem" i
  JOIN "Document" d ON d."id" = i."documentId"
  JOIN "Asset" a ON a."id" = i."assetId" AND a."deletedAt" IS NULL
  JOIN LATERAL (
    SELECT l."createdAt", l."createdBy"
    FROM "StockLedger" l
    WHERE l."refDocumentId" = d."id" AND l."assetId" = i."assetId"
      AND l."reversedByDocumentId" IS NULL
    ORDER BY l."createdAt" DESC, l."id" DESC
    LIMIT 1
  ) receipt ON true
  WHERE d."type" = 'RETURN' AND d."status" = 'CONFIRMED'
    AND btrim(coalesce(i."conditionNote", '')) <> ''
  ORDER BY i."assetId", receipt."createdAt" DESC, i."createdAt" DESC, i."id" DESC
), recovered AS (
  INSERT INTO "AssetConditionEvent" ("id", "assetId", "isDamaged", "note", "changedByUserId", "createdAt")
  SELECT 'return-damage-' || r."id", r."assetId", true, r.note, r."createdBy", r."createdAt"
  FROM reports r
  WHERE NOT EXISTS (
    SELECT 1 FROM "AssetConditionEvent" e
    WHERE e."assetId" = r."assetId" AND e."createdAt" >= r."createdAt"
  )
  ON CONFLICT ("id") DO NOTHING
  RETURNING "assetId", "note"
)
UPDATE "Asset" a
SET "isDamaged" = true, "damageNote" = r."note"
FROM recovered r WHERE a."id" = r."assetId";
