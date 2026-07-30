import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const inventoryAudit = await prisma.$queryRawUnsafe(`
    WITH effects AS (
      SELECT
        "id" || ':warehouse' AS event_id,
        "createdAt" AS created_at,
        COALESCE("assetId", "skuId") AS item_id,
        "ownerWarehouseId" AS owner_id,
        'WAREHOUSE' AS location_type,
        "warehouseId" AS location_id,
        "quantity"::numeric AS delta
      FROM "StockLedger"
      WHERE "warehouseId" IS NOT NULL

      UNION ALL

      SELECT
        "id" || ':onsite-owner',
        "createdAt",
        COALESCE("assetId", "skuId"),
        "ownerWarehouseId",
        'WAREHOUSE',
        "ownerWarehouseId",
        -"quantity"::numeric
      FROM "StockLedger"
      WHERE "movementType" = 'ON_SITE'

      UNION ALL

      SELECT
        "id" || ':site',
        "createdAt",
        COALESCE("assetId", "skuId"),
        "ownerWarehouseId",
        'WORKSITE',
        "customerWorksiteId",
        "quantity"::numeric
      FROM "StockLedger"
      WHERE "customerWorksiteId" IS NOT NULL
        AND "warehouseId" IS NULL

      UNION ALL

      SELECT
        "id" || ':return',
        "createdAt",
        COALESCE("assetId", "skuId"),
        "ownerWarehouseId",
        'WORKSITE',
        "customerWorksiteId",
        -"quantity"::numeric
      FROM "StockLedger"
      WHERE "customerWorksiteId" IS NOT NULL
        AND "movementType" = 'IN'
    ),
    running AS (
      SELECT
        *,
        SUM(delta) OVER (
          PARTITION BY item_id, owner_id, location_type, location_id
          ORDER BY created_at, event_id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS running_balance
      FROM effects
    ),
    positions AS (
      SELECT
        item_id,
        owner_id,
        location_type,
        location_id,
        SUM(delta) AS ending_balance,
        MIN(running_balance) AS minimum_balance
      FROM running
      GROUP BY item_id, owner_id, location_type, location_id
    )
    SELECT
      location_type,
      COUNT(*) FILTER (WHERE minimum_balance < 0)::int
        AS chronological_negative_positions,
      COUNT(*) FILTER (WHERE ending_balance < 0)::int
        AS ending_negative_positions,
      COUNT(*) FILTER (WHERE ending_balance > 0)::int AS positive_positions,
      COALESCE(
        SUM(ending_balance) FILTER (WHERE ending_balance > 0),
        0
      )::numeric AS positive_units
    FROM positions
    GROUP BY location_type
    ORDER BY location_type;
  `);

  const ownershipAudit = await prisma.$queryRawUnsafe(`
    WITH warehouse_effects AS (
      SELECT
        COALESCE("assetId", "skuId") AS item_id,
        "ownerWarehouseId" AS owner_id,
        "warehouseId" AS location_id,
        "quantity"::numeric AS delta
      FROM "StockLedger"
      WHERE "warehouseId" IS NOT NULL

      UNION ALL

      SELECT
        COALESCE("assetId", "skuId"),
        "ownerWarehouseId",
        "ownerWarehouseId",
        -"quantity"::numeric
      FROM "StockLedger"
      WHERE "movementType" = 'ON_SITE'
    ),
    site_effects AS (
      SELECT
        COALESCE("assetId", "skuId") AS item_id,
        "ownerWarehouseId" AS owner_id,
        "customerWorksiteId" AS location_id,
        "quantity"::numeric AS delta
      FROM "StockLedger"
      WHERE "customerWorksiteId" IS NOT NULL
        AND "warehouseId" IS NULL

      UNION ALL

      SELECT
        COALESCE("assetId", "skuId"),
        "ownerWarehouseId",
        "customerWorksiteId",
        -"quantity"::numeric
      FROM "StockLedger"
      WHERE "customerWorksiteId" IS NOT NULL
        AND "movementType" = 'IN'
    ),
    balances AS (
      SELECT
        'WAREHOUSE' AS location_type,
        item_id,
        owner_id,
        location_id,
        SUM(delta) AS balance
      FROM warehouse_effects
      GROUP BY item_id, owner_id, location_id

      UNION ALL

      SELECT
        'WORKSITE',
        item_id,
        owner_id,
        location_id,
        SUM(delta)
      FROM site_effects
      GROUP BY item_id, owner_id, location_id
    )
    SELECT
      b.location_type,
      w.type::text AS owner_type,
      COUNT(*) FILTER (WHERE b.balance > 0)::int AS positive_positions,
      COALESCE(
        SUM(b.balance) FILTER (WHERE b.balance > 0),
        0
      )::numeric AS positive_units
    FROM balances b
    JOIN "Warehouse" w ON w.id = b.owner_id
    GROUP BY b.location_type, w.type
    ORDER BY b.location_type, w.type;
  `);

  const catalogAudit = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*)::int AS sku_count,
      COUNT(*) FILTER (
        WHERE name ~* '(^|[^[:alpha:]])(CM|MT|MTS)([^[:alpha:]]|$)'
      )::int AS legacy_meter_unit_names,
      COUNT(*) FILTER (
        WHERE name ~ '[0-9][.,][0-9]+M'
      )::int AS compact_meter_names,
      COUNT(*) FILTER (
        WHERE size ~* '(^|[^[:alpha:]])(CM|MT|MTS)([^[:alpha:]]|$)'
      )::int AS legacy_meter_unit_sizes,
      COUNT(*) FILTER (
        WHERE size ~ '[0-9][.,][0-9]+M'
      )::int AS compact_meter_sizes
    FROM "Sku";
  `);

  const angleReferences = await prisma.$queryRawUnsafe(`
    SELECT
      s.id,
      s.name,
      s.size,
      COUNT(DISTINCT l."ownerWarehouseId")::int AS owners
    FROM "Sku" s
    JOIN "AssetSubfamily" sf ON sf.id = s."assetSubfamilyId"
    LEFT JOIN "StockLedger" l ON l."skuId" = s.id
    WHERE sf.name = 'ANGULO'
    GROUP BY s.id, s.name, s.size
    ORDER BY s.size;
  `);

  const verealAngles = await prisma.$queryRawUnsafe(`
    WITH effects AS (
      SELECT
        l."skuId",
        l."ownerWarehouseId",
        l."quantity"::numeric AS delta
      FROM "StockLedger" l
      WHERE l."warehouseId" IS NOT NULL

      UNION ALL

      SELECT
        l."skuId",
        l."ownerWarehouseId",
        -l."quantity"::numeric
      FROM "StockLedger" l
      WHERE l."movementType" = 'ON_SITE'

      UNION ALL

      SELECT
        l."skuId",
        l."ownerWarehouseId",
        l."quantity"::numeric
      FROM "StockLedger" l
      WHERE l."customerWorksiteId" IS NOT NULL
        AND l."warehouseId" IS NULL

      UNION ALL

      SELECT
        l."skuId",
        l."ownerWarehouseId",
        -l."quantity"::numeric
      FROM "StockLedger" l
      WHERE l."customerWorksiteId" IS NOT NULL
        AND l."movementType" = 'IN'
    )
    SELECT
      s.id,
      s.name,
      s.size,
      SUM(e.delta)::numeric AS total_units
    FROM effects e
    JOIN "Sku" s ON s.id = e."skuId"
    JOIN "AssetSubfamily" sf ON sf.id = s."assetSubfamilyId"
    JOIN "Warehouse" w ON w.id = e."ownerWarehouseId"
    WHERE sf.name = 'ANGULO'
      AND w.name = 'VEREAL MAQUINARIA SAS'
    GROUP BY s.id, s.name, s.size
    HAVING SUM(e.delta) <> 0
    ORDER BY s.size;
  `);

  const caseAsset = await prisma.asset.findUnique({
    where: { id: '4c34a24a-27c0-458b-8362-a6ec67fc97fb' },
    select: {
      id: true,
      publicCode: true,
      internalNumber: true,
      brand: true,
      model: true,
      hourMeter: true,
      imageFileObjectId: true,
      active: true,
      _count: { select: { hourReadings: true } },
    },
  });

  const stringify = (value: unknown) =>
    JSON.stringify(
      value,
      (_key, item) =>
        typeof item === 'bigint'
          ? item.toString()
          : item && typeof item === 'object' && 'toNumber' in item
            ? (item as { toNumber(): number }).toNumber()
            : item,
      2,
    );

  console.log(
    stringify({
      inventoryAudit,
      ownershipAudit,
      catalogAudit,
      angleReferences,
      verealAngles,
      caseAsset,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
