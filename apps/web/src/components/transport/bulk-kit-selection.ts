import type { InventoryBulk, SelectedItem } from "./request-types";
export type KitPiece = {
  skuId: string;
  quantity: number;
  name: string;
  sourceKey?: string;
};
export function kitSourceKey(
  item: Pick<
    InventoryBulk,
    "skuId" | "ownerWarehouseId" | "sourceWarehouseId" | "sourceDocumentItemId"
  >,
) {
  return `${item.skuId}::${item.ownerWarehouseId ?? "none"}${item.sourceWarehouseId ? `::${item.sourceWarehouseId}` : ""}${item.sourceDocumentItemId ? `::origin:${item.sourceDocumentItemId}` : ""}`;
}
// All-or-nothing expansion; never selects an ambiguous owner/source automatically.
export function addBulkKitPieces(
  current: SelectedItem[],
  pieces: KitPiece[],
  count: number,
  inventory: InventoryBulk[],
  createId: () => string,
): SelectedItem[] {
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > 10000 ||
    !pieces.length
  )
    throw new Error(
      "Ingresa una cantidad entera de conjuntos entre 1 y 10.000.",
    );
  if (new Set(pieces.map((piece) => piece.skuId)).size !== pieces.length)
    throw new Error("El conjunto repite una pieza. Corrige su configuración.");
  const planned = pieces.map((piece) => {
    const quantity = piece.quantity * count;
    if (
      !Number.isSafeInteger(piece.quantity) ||
      piece.quantity < 1 ||
      !Number.isSafeInteger(quantity) ||
      quantity > 1000000000
    )
      throw new Error("Cantidad de piezas inválida.");
    const sources = inventory.filter(
      (item) =>
        item.skuId === piece.skuId &&
        item.ownerWarehouseId &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0,
    );
    if (!sources.length)
      throw new Error(
        `No hay existencias de ${piece.name} en el inventario seleccionado.`,
      );
    const matchingSources = piece.sourceKey
      ? sources.filter((item) => kitSourceKey(item) === piece.sourceKey)
      : sources;
    if (matchingSources.length !== 1)
      throw new Error(`Selecciona la procedencia de ${piece.name}.`);
    const source = matchingSources[0];
    const key = kitSourceKey(source);
    const existing = current.filter(
      (item) =>
        item.type === "bulk" &&
        (item.bulkKey === key ||
          (item.skuId === source.skuId &&
            item.ownerWarehouseId === source.ownerWarehouseId &&
            (item.sourceWarehouseId ?? null) ===
              (source.sourceWarehouseId ?? null) &&
            (item.sourceDocumentItemId ?? null) ===
              (source.sourceDocumentItemId ?? null))),
    );
    const selectedQuantity = existing.reduce(
      (sum, item) => sum + Number(item.quantity ?? 1),
      0,
    );
    if (
      !Number.isFinite(selectedQuantity) ||
      selectedQuantity < 0 ||
      selectedQuantity + quantity > source.quantity
    )
      throw new Error(
        `No hay suficientes unidades de ${piece.name}. Disponibles para agregar: ${Math.max(0, source.quantity - selectedQuantity)}.`,
      );
    const standalone = existing.find(
      (item) => !item.parentCompositionNodeId && !item.componentParentAssetId,
    );
    return { source, quantity, key, standalone };
  });
  const next = current.map((item) => ({ ...item }));
  for (const { source, quantity, key, standalone } of planned) {
    if (standalone) {
      const index = next.findIndex(
        (item) => item.selectionId === standalone.selectionId,
      );
      next[index] = {
        ...next[index],
        quantity: Number(standalone.quantity ?? 1) + quantity,
        availableQuantity: source.quantity,
      };
    } else {
      next.push({
        selectionId: createId(),
        type: "bulk",
        bulkKey: key,
        skuId: source.skuId,
        name:
          source.skuName ??
          pieces.find((piece) => piece.skuId === source.skuId)!.name,
        quantity,
        availableQuantity: source.quantity,
        ownerWarehouseId: source.ownerWarehouseId,
        sourceWarehouseId: source.sourceWarehouseId,
      });
    }
  }
  return next;
}
