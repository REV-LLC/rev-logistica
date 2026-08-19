import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type AuditSummary = {
  affected_groups: number;
  bulk_groups: number;
  serial_groups: number;
  false_shortage_groups: number;
  false_availability_groups: number;
  physical_negative_groups: number;
  legacy_negative_groups: number;
};

async function main() {
  const [summary] = await prisma.$queryRaw<AuditSummary[]>`
    WITH physical AS (
      SELECT
        CASE WHEN "skuId" IS NOT NULL THEN 'BULK' ELSE 'SERIAL' END AS kind,
        "warehouseId" AS warehouse_id,
        COALESCE("skuId", "assetId") AS item_id,
        "ownerWarehouseId" AS owner_warehouse_id,
        SUM("quantity")::numeric AS balance
      FROM "StockLedger"
      WHERE "warehouseId" IS NOT NULL
      GROUP BY kind, "warehouseId", item_id, "ownerWarehouseId"
    ),
    legacy_approval AS (
      SELECT
        CASE WHEN "skuId" IS NOT NULL THEN 'BULK' ELSE 'SERIAL' END AS kind,
        "warehouseId" AS warehouse_id,
        COALESCE("skuId", "assetId") AS item_id,
        "ownerWarehouseId" AS owner_warehouse_id,
        SUM("quantity")::numeric AS balance
      FROM "StockLedger"
      WHERE "warehouseId" IS NOT NULL
        AND "customerWorksiteId" IS NULL
      GROUP BY kind, "warehouseId", item_id, "ownerWarehouseId"
    ),
    differences AS (
      SELECT
        COALESCE(p.kind, l.kind) AS kind,
        COALESCE(p.balance, 0) AS physical_balance,
        COALESCE(l.balance, 0) AS legacy_balance
      FROM physical p
      FULL OUTER JOIN legacy_approval l
        ON l.kind = p.kind
        AND l.warehouse_id = p.warehouse_id
        AND l.item_id = p.item_id
        AND l.owner_warehouse_id = p.owner_warehouse_id
      WHERE COALESCE(p.balance, 0) <> COALESCE(l.balance, 0)
    )
    SELECT
      COUNT(*)::int AS affected_groups,
      COUNT(*) FILTER (WHERE kind = 'BULK')::int AS bulk_groups,
      COUNT(*) FILTER (WHERE kind = 'SERIAL')::int AS serial_groups,
      COUNT(*) FILTER (WHERE physical_balance > legacy_balance)::int
        AS false_shortage_groups,
      COUNT(*) FILTER (WHERE physical_balance < legacy_balance)::int
        AS false_availability_groups,
      COUNT(*) FILTER (WHERE physical_balance < 0)::int
        AS physical_negative_groups,
      COUNT(*) FILTER (WHERE legacy_balance < 0)::int
        AS legacy_negative_groups
    FROM differences;
  `;

  process.stdout.write(
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      summary,
    })}\n`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
