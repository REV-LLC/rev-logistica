-- Only these explicit projections are visible to the Office assistant.
-- Do not expose User, tokens, settings, files/storage keys or notification payloads.
CREATE SCHEMA IF NOT EXISTS rev_office;

CREATE OR REPLACE VIEW rev_office.catalog AS
SELECT s.id AS sku_id, s.name AS item_name, f.name AS family_name,
  f.code AS family_code, f."controlType"::text AS control_type,
  sf.name AS subfamily_name, s.size, s.price, s."subrentalPrice" AS subrental_price,
  s."replacementValue" AS replacement_value, s."chargeType"::text AS charge_type,
  s."minimumChargeHours" AS minimum_charge_hours, s."unitWeight" AS unit_weight,
  s."lengthMeters" AS length_meters, s."areaM2" AS area_m2, s.active
FROM public."Sku" s
JOIN public."AssetFamily" f ON f.id = s."assetFamilyId"
LEFT JOIN public."AssetSubfamily" sf ON sf.id = s."assetSubfamilyId";

CREATE OR REPLACE VIEW rev_office.owners AS
SELECT o.id AS owner_id, o.name AS owner_name,
  COALESCE(to_jsonb(o)->>'category', CASE WHEN EXISTS (
    SELECT 1 FROM public."Warehouse" w WHERE w."ownerCompanyId" = o.id AND w.type = 'OWN'
  ) THEN 'INTERNAL' ELSE 'PROVIDER' END) AS owner_category,
  o."nitOrId" AS identification, o.phone, o.email, o.active FROM public."Owner" o;

CREATE OR REPLACE VIEW rev_office.warehouses AS
SELECT w.id AS warehouse_id, w.name AS warehouse_name, w.type::text AS warehouse_type,
  o.owner_id, o.owner_name, o.owner_category, w.active
FROM public."Warehouse" w JOIN rev_office.owners o ON o.owner_id = w."ownerCompanyId";

CREATE OR REPLACE VIEW rev_office.customers AS
SELECT id AS customer_id, name AS customer_name, "nitOrId" AS identification,
  phone, email, "billingAddress" AS billing_address, active FROM public."Customer";

CREATE OR REPLACE VIEW rev_office.worksites AS
SELECT id AS worksite_id, name AS worksite_name, "externalCode" AS external_code,
  address, "contactName" AS contact_name, phone, email, active FROM public."Project";

CREATE OR REPLACE VIEW rev_office.customer_worksites AS
SELECT cw.id AS customer_worksite_id, cw."customerId" AS customer_id,
  c.customer_name, cw."worksiteId" AS worksite_id, w.worksite_name,
  cw.alias, cw.active FROM public."CustomerWorksite" cw
JOIN rev_office.customers c ON c.customer_id = cw."customerId"
JOIN rev_office.worksites w ON w.worksite_id = cw."worksiteId";

CREATE OR REPLACE VIEW rev_office.assets AS
SELECT a.id AS asset_id, a."skuId" AS sku_id, c.item_name, c.family_name,
  a."publicCode" AS public_code, a."serialOrEngine" AS serial_number,
  a."internalNumber" AS internal_number, a."registrationNumber" AS registration_number,
  a.brand, a.model, a.year, a.description, a."hourMeter" AS hour_meter,
  a."warehouseOwnerId" AS owner_warehouse_id, o.warehouse_name AS owner_warehouse_name,
  o.owner_id, o.owner_name, o.owner_category,
  a."warehouseCurrentId" AS current_warehouse_id,
  a.active, a."deletedAt" AS deleted_at, a.kind::text AS kind,
  a."assignedMotorId" AS assigned_motor_id,
  last_move."movementType"::text AS last_movement_type,
  last_move."effectiveAt" AS last_movement_at
FROM public."Asset" a JOIN rev_office.catalog c ON c.sku_id = a."skuId"
JOIN rev_office.warehouses o ON o.warehouse_id = a."warehouseOwnerId"
LEFT JOIN LATERAL (
  SELECT l."movementType", COALESCE((to_jsonb(l)->>'effectiveAt')::timestamp,
    (SELECT d."docDate" FROM public."Document" d WHERE d.id = l."refDocumentId"),
    l."createdAt") AS "effectiveAt" FROM public."StockLedger" l
  WHERE l."assetId" = a.id
  ORDER BY COALESCE((to_jsonb(l)->>'isOpeningBalance')::boolean, false) ASC,
    "effectiveAt" DESC, l."createdAt" DESC, l.id DESC
  LIMIT 1
) last_move ON true;

CREATE OR REPLACE VIEW rev_office.documents AS
SELECT d.id AS document_id, d.consecutive, d.type::text AS document_type,
  d.status::text AS status, d."docDate" AS document_date,
  d."customerWorksiteId" AS customer_worksite_id, cw.customer_id, cw.customer_name,
  cw.worksite_id, cw.worksite_name, d."warehouseId" AS warehouse_id,
  d."providerWarehouseId" AS provider_warehouse_id, d."createdAt" AS created_at
FROM public."Document" d
LEFT JOIN rev_office.customer_worksites cw ON cw.customer_worksite_id = d."customerWorksiteId";

CREATE OR REPLACE VIEW rev_office.document_items AS
SELECT i.id AS document_item_id, i."documentId" AS document_id,
  COALESCE(i."skuId", a."skuId") AS sku_id, i."assetId" AS asset_id,
  COALESCE(i.quantity, CASE WHEN i."assetId" IS NOT NULL THEN 1 END) AS quantity,
  i."billingStatus"::text AS billing_status, i."billingCutoffDate" AS billing_cutoff_date,
  i."returnedAt" AS returned_at, i."damageCostEstimate" AS damage_cost_estimate,
  i."componentParentAssetId" AS component_parent_asset_id
FROM public."DocumentItem" i LEFT JOIN public."Asset" a ON a.id = i."assetId";

CREATE OR REPLACE VIEW rev_office.movements AS
SELECT l.id AS movement_id, COALESCE(l."skuId", a."skuId") AS sku_id,
  l."assetId" AS asset_id, l."warehouseId" AS warehouse_id,
  l."ownerWarehouseId" AS owner_warehouse_id, l."customerWorksiteId" AS customer_worksite_id,
  l."movementType"::text AS movement_type, l.quantity,
  CASE WHEN l."movementType" = 'ON_SITE' THEN l.quantity
       WHEN l."movementType" IN ('OUT', 'IN', 'TRANSIT') THEN -l.quantity
       ELSE 0 END AS worksite_delta,
  -- Read older installations too, without migrating their business records.
  COALESCE((to_jsonb(l)->>'effectiveAt')::timestamp,
    (SELECT d."docDate" FROM public."Document" d WHERE d.id = l."refDocumentId"),
    l."createdAt") AS effective_at, l."createdAt" AS recorded_at,
  COALESCE((to_jsonb(l)->>'isOpeningBalance')::boolean, false) AS is_opening_balance,
  l."refDocumentId" AS document_id, l."refDocumentType"::text AS document_type
FROM public."StockLedger" l LEFT JOIN public."Asset" a ON a.id = l."assetId";

-- These equations match physicalWarehouseLedgerWhere, getWorksiteQuantityDelta
-- and buildSerializedWarehouseAvailability. Do not sum DocumentItem quantities
-- to report current rentals; deliveries may already have been returned.
CREATE OR REPLACE VIEW rev_office.inventory_balances AS
WITH location_deltas AS (
  SELECT 'WAREHOUSE'::text AS location_type, warehouse_id AS location_id,
    sku_id, asset_id, owner_warehouse_id, quantity AS delta
  FROM rev_office.movements WHERE warehouse_id IS NOT NULL
  UNION ALL
  SELECT 'WAREHOUSE', owner_warehouse_id, sku_id, asset_id, owner_warehouse_id, -quantity
  FROM rev_office.movements WHERE movement_type = 'ON_SITE'
  UNION ALL
  SELECT 'WORKSITE', customer_worksite_id, sku_id, asset_id, owner_warehouse_id, worksite_delta
  FROM rev_office.movements
  WHERE customer_worksite_id IS NOT NULL AND movement_type IN ('OUT', 'ON_SITE', 'IN', 'TRANSIT')
), balances AS (
  SELECT location_type, location_id, sku_id, asset_id, owner_warehouse_id, SUM(delta) AS quantity
  FROM location_deltas GROUP BY location_type, location_id, sku_id, asset_id, owner_warehouse_id
  HAVING SUM(delta) <> 0
)
SELECT b.*, c.item_name, c.family_name, c.subfamily_name, c.control_type,
  c.size, c.active AS item_active, a.public_code, a.serial_number,
  CASE WHEN b.asset_id IS NULL THEN c.active ELSE a.active AND a.deleted_at IS NULL END AS active,
  CASE WHEN b.asset_id IS NULL THEN b.quantity >= 0 ELSE b.quantity = 1 END AS balance_valid,
  o.warehouse_name AS owner_warehouse_name, o.owner_id, o.owner_name, o.owner_category,
  CASE WHEN b.location_type = 'WAREHOUSE' THEN w.warehouse_name
       ELSE COALESCE(NULLIF(BTRIM(cw.alias), ''), cw.worksite_name) END AS location_name,
  w.warehouse_type, cw.customer_id, cw.customer_name, cw.worksite_id, cw.worksite_name
FROM balances b JOIN rev_office.catalog c ON c.sku_id = b.sku_id
JOIN rev_office.warehouses o ON o.warehouse_id = b.owner_warehouse_id
LEFT JOIN rev_office.assets a ON a.asset_id = b.asset_id
LEFT JOIN rev_office.warehouses w ON b.location_type = 'WAREHOUSE' AND w.warehouse_id = b.location_id
LEFT JOIN rev_office.customer_worksites cw ON b.location_type = 'WORKSITE' AND cw.customer_worksite_id = b.location_id;

CREATE OR REPLACE VIEW rev_office.provider_prices AS
SELECT p."providerWarehouseId" AS provider_warehouse_id, w.warehouse_name AS provider_warehouse_name,
  w.owner_id, w.owner_name, p."skuId" AS sku_id, c.item_name, p.price,
  p."updatedAt" AS updated_at
FROM public."ProviderSkuPrice" p JOIN rev_office.warehouses w ON w.warehouse_id = p."providerWarehouseId"
JOIN rev_office.catalog c ON c.sku_id = p."skuId";
