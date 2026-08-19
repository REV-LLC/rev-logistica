CREATE TABLE "AssetFamilyComponent" (
    "id" TEXT NOT NULL,
    "parentAssetFamilyId" TEXT NOT NULL,
    "componentAssetFamilyId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "minimumQuantity" INTEGER NOT NULL DEFAULT 0,
    "maximumQuantity" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetFamilyComponent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AssetFamilyComponent_quantity_check"
      CHECK (
        "minimumQuantity" >= 0
        AND ("maximumQuantity" IS NULL OR "maximumQuantity" >= "minimumQuantity")
      ),
    CONSTRAINT "AssetFamilyComponent_not_self_check"
      CHECK ("parentAssetFamilyId" <> "componentAssetFamilyId")
);

CREATE UNIQUE INDEX "AssetFamilyComponent_parentAssetFamilyId_componentAssetFamilyId_key"
ON "AssetFamilyComponent"("parentAssetFamilyId", "componentAssetFamilyId");

CREATE INDEX "AssetFamilyComponent_componentAssetFamilyId_idx"
ON "AssetFamilyComponent"("componentAssetFamilyId");

CREATE INDEX "AssetFamilyComponent_parentAssetFamilyId_active_sortOrder_idx"
ON "AssetFamilyComponent"("parentAssetFamilyId", "active", "sortOrder");

ALTER TABLE "AssetFamilyComponent"
ADD CONSTRAINT "AssetFamilyComponent_parentAssetFamilyId_fkey"
FOREIGN KEY ("parentAssetFamilyId") REFERENCES "AssetFamily"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetFamilyComponent"
ADD CONSTRAINT "AssetFamilyComponent_componentAssetFamilyId_fkey"
FOREIGN KEY ("componentAssetFamilyId") REFERENCES "AssetFamily"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentItem" ADD COLUMN "componentParentAssetId" TEXT;

CREATE INDEX "DocumentItem_componentParentAssetId_idx"
ON "DocumentItem"("componentParentAssetId");

ALTER TABLE "DocumentItem"
ADD CONSTRAINT "DocumentItem_componentParentAssetId_fkey"
FOREIGN KEY ("componentParentAssetId") REFERENCES "Asset"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Initial configuration. The name matching intentionally tolerates the current
-- catalog's singular/plural variants and does nothing when a family is absent.
WITH parent_component(parent_pattern, component_pattern, sort_order) AS (
  VALUES
    ('%COMPRESOR%', '%MANGUERA%', 10),
    ('%COMPRESOR%', '%MARTILLO%NEUM%', 20),
    ('%COMPRESOR%', '%APT%', 30),
    ('%BRUTE%', '%PUNTA%', 10),
    ('%MEZCLADOR%', '%MOTOR%', 10)
), matches AS (
  SELECT DISTINCT ON (parent.id, component.id)
    parent.id AS parent_id,
    component.id AS component_id,
    config.sort_order
  FROM parent_component config
  JOIN "AssetFamily" parent
    ON UPPER(parent.name) LIKE config.parent_pattern
    OR UPPER(parent.code) LIKE config.parent_pattern
  JOIN "AssetFamily" component
    ON UPPER(component.name) LIKE config.component_pattern
    OR UPPER(component.code) LIKE config.component_pattern
  WHERE parent.id <> component.id
)
INSERT INTO "AssetFamilyComponent" (
  "id", "parentAssetFamilyId", "componentAssetFamilyId", "sortOrder", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  parent_id,
  component_id,
  sort_order,
  CURRENT_TIMESTAMP
FROM matches
ON CONFLICT ("parentAssetFamilyId", "componentAssetFamilyId") DO NOTHING;
