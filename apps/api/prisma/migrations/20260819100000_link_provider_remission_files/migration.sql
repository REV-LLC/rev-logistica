ALTER TABLE "FileObject" ADD COLUMN "providerWarehouseId" TEXT;

UPDATE "FileObject" AS file
SET "providerWarehouseId" = source."providerWarehouseId"
FROM (
    SELECT
        candidate.id AS "fileId",
        MIN(item.condition) AS "providerWarehouseId"
    FROM "FileObject" AS candidate
    INNER JOIN "DocumentItem" AS item
        ON item."documentId" = candidate."documentId"
    INNER JOIN "Warehouse" AS warehouse
        ON warehouse.id = item.condition
       AND warehouse.type = 'ALLY'
    WHERE candidate.category = 'COMPROBANTE_SALIDA_PROVEEDOR'
    GROUP BY candidate.id
    HAVING COUNT(DISTINCT item.condition) = 1
) AS source
WHERE file.id = source."fileId";

CREATE INDEX "FileObject_providerWarehouseId_category_createdAt_idx"
ON "FileObject"("providerWarehouseId", category, "createdAt" DESC);

ALTER TABLE "FileObject"
ADD CONSTRAINT "FileObject_providerWarehouseId_fkey"
FOREIGN KEY ("providerWarehouseId") REFERENCES "Warehouse"(id)
ON DELETE SET NULL ON UPDATE CASCADE;
