import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type Source = {
  skuId: string;
  ownerWarehouseId: string;
  quantity: number;
  locationId: string;
};

/** Caller holds the SKU locks until the enclosing movement transaction commits.
 * Check the stock at insertion AND every later movement, not just today's sum.
 * A candidate appends after existing rows at its exact instant. Opening balances
 * are catalogue stock and must not masquerade as future dated receipts.
 */
export async function assertBulkSourceTimeline(
  tx: Prisma.TransactionClient,
  kind: 'WORKSITE' | 'WAREHOUSE' | 'OWNER',
  sources: Source[],
  at: Date,
) {
  if (!sources.length) return;
  const rows = await tx.$queryRaw<
    Array<{
      balance: Prisma.Decimal;
      effectiveAt: Date;
      name: string;
      consecutive: string | null;
    }>
  >(Prisma.sql`
    WITH requested AS (
      SELECT "skuId", "ownerWarehouseId", "locationId", SUM(quantity) AS quantity
      FROM (VALUES ${Prisma.join(
        sources.map(
          (source) => Prisma.sql`(
        ${source.skuId}::text, ${source.ownerWarehouseId}::text,
        ${source.locationId}::text, ${source.quantity}::numeric
      )`,
        ),
      )}) AS inputs("skuId", "ownerWarehouseId", "locationId", quantity)
      GROUP BY "skuId", "ownerWarehouseId", "locationId"
    ), history AS (
      SELECT r."skuId", r."ownerWarehouseId", r."locationId", l.id,
        l."effectiveAt", l."appendOrder", l."createdAt", l."refDocumentId",
        l."isOpeningBalance",
        CASE WHEN ${kind} = 'WORKSITE' THEN
          CASE l."movementType" WHEN 'OUT' THEN -l.quantity
            WHEN 'ON_SITE' THEN l.quantity ELSE -l.quantity END
        WHEN ${kind} = 'OWNER' THEN
          CASE WHEN l."movementType" IN ('IN', 'TRANSIT') AND l."customerWorksiteId" IS NOT NULL THEN l.quantity
            WHEN l."movementType" = 'ON_SITE' THEN -l.quantity
            WHEN l."warehouseId" = r."locationId" AND l."customerWorksiteId" IS NULL THEN l.quantity
            ELSE 0 END
        ELSE
          CASE WHEN l."warehouseId" = r."locationId" THEN l.quantity ELSE 0 END
          - CASE WHEN l."movementType" = 'ON_SITE'
              AND l."ownerWarehouseId" = r."locationId" THEN l.quantity ELSE 0 END
        END AS delta
      FROM requested r JOIN "StockLedger" l
        ON l."skuId" = r."skuId" AND l."ownerWarehouseId" = r."ownerWarehouseId"
        AND l."assetId" IS NULL
        AND ((${kind} = 'WORKSITE' AND l."customerWorksiteId" = r."locationId"
          AND l."movementType" IN ('OUT', 'ON_SITE', 'IN', 'TRANSIT'))
          OR (${kind} = 'OWNER' AND l."ownerWarehouseId" = r."locationId")
          OR (${kind} = 'WAREHOUSE' AND (l."warehouseId" = r."locationId"
            OR (l."movementType" = 'ON_SITE' AND l."ownerWarehouseId" = r."locationId"))))
    ), starting AS (
      SELECT r.*, COALESCE(SUM(h.delta) FILTER (
        WHERE h."effectiveAt" <= ${at} OR h."isOpeningBalance"), 0) - r.quantity AS balance
      FROM requested r LEFT JOIN history h USING ("skuId", "ownerWarehouseId", "locationId")
      GROUP BY r."skuId", r."ownerWarehouseId", r."locationId", r.quantity
    ), checkpoints AS (
      SELECT s."skuId", s.balance, ${at}::timestamp AS "effectiveAt", NULL::text AS "refDocumentId"
      FROM starting s
      UNION ALL
      SELECT h."skuId", s.balance + SUM(h.delta) OVER (
        PARTITION BY h."skuId", h."ownerWarehouseId", h."locationId"
        ORDER BY h."effectiveAt", h."appendOrder" ASC NULLS FIRST, h."createdAt", h.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ), h."effectiveAt", h."refDocumentId"
      FROM history h JOIN starting s USING ("skuId", "ownerWarehouseId", "locationId")
      WHERE h."effectiveAt" > ${at} AND NOT h."isOpeningBalance"
    )
    SELECT c.balance, c."effectiveAt", s.name, d.consecutive
    FROM checkpoints c JOIN "Sku" s ON s.id = c."skuId"
    LEFT JOIN "Document" d ON d.id = c."refDocumentId"
    WHERE c.balance < 0 ORDER BY c."effectiveAt" LIMIT 1
  `);
  const conflict = rows.find(
    (row) => row.balance != null && new Prisma.Decimal(row.balance).lt(0),
  );
  if (!conflict) return;
  const date = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(conflict.effectiveAt);
  const location = kind === 'WORKSITE' ? 'la obra' : 'la bodega de origen';
  throw new BadRequestException({
    code: 'BACKDATED_STOCK_SHORTAGE',
    message: `No se pudo registrar el documento: con esa fecha, «${conflict.name}» quedaría con ${conflict.balance.toString()} unidades en ${location} el ${date}${conflict.consecutive ? `, al aplicar el documento ${conflict.consecutive}` : ''}. Revisa la fecha y la cantidad, o registra primero la entrega que falta. No se guardó ningún movimiento de este intento.`,
  });
}
