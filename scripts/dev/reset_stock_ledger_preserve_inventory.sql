BEGIN;

CREATE TEMP TABLE reset_actor AS
SELECT id AS created_by
FROM "User"
WHERE role = 'ADMIN'
ORDER BY "createdAt" ASC
LIMIT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM reset_actor) THEN
    RAISE EXCEPTION 'No ADMIN user found to attribute opening ledger entries';
  END IF;
END $$;

CREATE TEMP TABLE snapshot_warehouse_bulk AS
WITH bulk_rows AS (
  SELECT
    "warehouseId" AS warehouse_id,
    "skuId" AS sku_id,
    "ownerWarehouseId" AS owner_warehouse_id,
    SUM(quantity)::numeric AS quantity
  FROM "StockLedger"
  WHERE "warehouseId" IS NOT NULL
    AND "skuId" IS NOT NULL
  GROUP BY 1, 2, 3
),
bulk_onsite_rows AS (
  SELECT
    "ownerWarehouseId" AS owner_warehouse_id,
    "skuId" AS sku_id,
    SUM(quantity)::numeric AS quantity
  FROM "StockLedger"
  WHERE "movementType" = 'ON_SITE'
    AND "skuId" IS NOT NULL
  GROUP BY 1, 2
)
SELECT
  b.warehouse_id,
  b.sku_id,
  b.owner_warehouse_id,
  (b.quantity - COALESCE(o.quantity, 0))::numeric AS quantity
FROM bulk_rows b
LEFT JOIN bulk_onsite_rows o
  ON o.owner_warehouse_id = b.owner_warehouse_id
 AND o.sku_id = b.sku_id
 AND o.owner_warehouse_id = b.warehouse_id
WHERE (b.quantity - COALESCE(o.quantity, 0)) <> 0;

CREATE TEMP TABLE snapshot_warehouse_serial AS
WITH serial_rows AS (
  SELECT
    "warehouseId" AS warehouse_id,
    "assetId" AS asset_id,
    SUM(quantity)::numeric AS quantity
  FROM "StockLedger"
  WHERE "warehouseId" IS NOT NULL
    AND "assetId" IS NOT NULL
  GROUP BY 1, 2
),
serial_onsite_rows AS (
  SELECT
    "ownerWarehouseId" AS owner_warehouse_id,
    "assetId" AS asset_id,
    SUM(quantity)::numeric AS quantity
  FROM "StockLedger"
  WHERE "movementType" = 'ON_SITE'
    AND "assetId" IS NOT NULL
  GROUP BY 1, 2
)
SELECT
  s.warehouse_id,
  s.asset_id,
  a."warehouseOwnerId" AS owner_warehouse_id,
  (s.quantity - COALESCE(o.quantity, 0))::numeric AS quantity
FROM serial_rows s
JOIN "Asset" a
  ON a.id = s.asset_id
LEFT JOIN serial_onsite_rows o
  ON o.asset_id = s.asset_id
 AND o.owner_warehouse_id = s.warehouse_id
WHERE (s.quantity - COALESCE(o.quantity, 0)) <> 0;

CREATE TEMP TABLE snapshot_onsite_bulk AS
WITH onsite_rows AS (
  SELECT
    "customerWorksiteId" AS customer_worksite_id,
    "skuId" AS sku_id,
    "ownerWarehouseId" AS owner_warehouse_id,
    SUM(quantity)::numeric AS quantity
  FROM "StockLedger"
  WHERE "movementType" = 'ON_SITE'
    AND "skuId" IS NOT NULL
    AND "customerWorksiteId" IS NOT NULL
  GROUP BY 1, 2, 3
),
in_rows AS (
  SELECT
    "customerWorksiteId" AS customer_worksite_id,
    "skuId" AS sku_id,
    "ownerWarehouseId" AS owner_warehouse_id,
    SUM(quantity)::numeric AS quantity
  FROM "StockLedger"
  WHERE "movementType" = 'IN'
    AND "skuId" IS NOT NULL
    AND "customerWorksiteId" IS NOT NULL
  GROUP BY 1, 2, 3
)
SELECT
  COALESCE(o.customer_worksite_id, i.customer_worksite_id) AS customer_worksite_id,
  COALESCE(o.sku_id, i.sku_id) AS sku_id,
  COALESCE(o.owner_warehouse_id, i.owner_warehouse_id) AS owner_warehouse_id,
  (COALESCE(o.quantity, 0) - COALESCE(i.quantity, 0))::numeric AS quantity
FROM onsite_rows o
FULL OUTER JOIN in_rows i
  ON i.customer_worksite_id = o.customer_worksite_id
 AND i.sku_id = o.sku_id
 AND i.owner_warehouse_id = o.owner_warehouse_id
WHERE (COALESCE(o.quantity, 0) - COALESCE(i.quantity, 0)) <> 0;

CREATE TEMP TABLE snapshot_onsite_serial AS
WITH onsite_rows AS (
  SELECT
    "customerWorksiteId" AS customer_worksite_id,
    "assetId" AS asset_id,
    SUM(quantity)::numeric AS quantity
  FROM "StockLedger"
  WHERE "movementType" = 'ON_SITE'
    AND "assetId" IS NOT NULL
    AND "customerWorksiteId" IS NOT NULL
  GROUP BY 1, 2
),
in_rows AS (
  SELECT
    "customerWorksiteId" AS customer_worksite_id,
    "assetId" AS asset_id,
    SUM(quantity)::numeric AS quantity
  FROM "StockLedger"
  WHERE "movementType" = 'IN'
    AND "assetId" IS NOT NULL
    AND "customerWorksiteId" IS NOT NULL
  GROUP BY 1, 2
)
SELECT
  COALESCE(o.customer_worksite_id, i.customer_worksite_id) AS customer_worksite_id,
  COALESCE(o.asset_id, i.asset_id) AS asset_id,
  a."warehouseOwnerId" AS owner_warehouse_id,
  (COALESCE(o.quantity, 0) - COALESCE(i.quantity, 0))::numeric AS quantity
FROM onsite_rows o
FULL OUTER JOIN in_rows i
  ON i.customer_worksite_id = o.customer_worksite_id
 AND i.asset_id = o.asset_id
JOIN "Asset" a
  ON a.id = COALESCE(o.asset_id, i.asset_id)
WHERE (COALESCE(o.quantity, 0) - COALESCE(i.quantity, 0)) <> 0;

DELETE FROM "StockLedger";

INSERT INTO "StockLedger" (
  id,
  "skuId",
  "warehouseId",
  "ownerWarehouseId",
  "movementType",
  quantity,
  "createdBy"
)
SELECT
  gen_random_uuid(),
  snapshot.sku_id,
  snapshot.warehouse_id,
  snapshot.owner_warehouse_id,
  'ADJUST'::"MovementType",
  snapshot.quantity,
  actor.created_by
FROM snapshot_warehouse_bulk snapshot
CROSS JOIN reset_actor actor;

INSERT INTO "StockLedger" (
  id,
  "assetId",
  "warehouseId",
  "ownerWarehouseId",
  "movementType",
  quantity,
  "createdBy"
)
SELECT
  gen_random_uuid(),
  snapshot.asset_id,
  snapshot.warehouse_id,
  snapshot.owner_warehouse_id,
  'ADJUST'::"MovementType",
  snapshot.quantity,
  actor.created_by
FROM snapshot_warehouse_serial snapshot
CROSS JOIN reset_actor actor;

INSERT INTO "StockLedger" (
  id,
  "skuId",
  "ownerWarehouseId",
  "customerWorksiteId",
  "movementType",
  quantity,
  "createdBy"
)
SELECT
  gen_random_uuid(),
  snapshot.sku_id,
  snapshot.owner_warehouse_id,
  snapshot.customer_worksite_id,
  'ON_SITE'::"MovementType",
  snapshot.quantity,
  actor.created_by
FROM snapshot_onsite_bulk snapshot
CROSS JOIN reset_actor actor;

INSERT INTO "StockLedger" (
  id,
  "assetId",
  "ownerWarehouseId",
  "customerWorksiteId",
  "movementType",
  quantity,
  "createdBy"
)
SELECT
  gen_random_uuid(),
  snapshot.asset_id,
  snapshot.owner_warehouse_id,
  snapshot.customer_worksite_id,
  'ON_SITE'::"MovementType",
  snapshot.quantity,
  actor.created_by
FROM snapshot_onsite_serial snapshot
CROSS JOIN reset_actor actor;

COMMIT;
