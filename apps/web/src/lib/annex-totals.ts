// Monetary totals arrive from the API with exactly two decimal places.
// Keep the tax calculation in cents and round once, after discounts.
export function annexTaxTotals(net: string, vatPercent: number) {
  if (!/^\d+\.\d{2}$/.test(net)) throw new Error("Subtotal inválido");
  if (!Number.isInteger(vatPercent) || vatPercent < 0 || vatPercent > 100)
    throw new Error("Porcentaje de IVA inválido");
  const cents = BigInt(net.replace(".", ""));
  const vat = (cents * BigInt(vatPercent) + 50n) / 100n;
  const amount = (value: bigint) =>
    `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
  return { vat: amount(vat), total: amount(cents + vat) };
}

type Transport = {
  outbound: { quantity: string; unitPrice: string };
  return: { quantity: string; unitPrice: string };
  rows?: {
    id: string;
    direction: "outbound" | "return";
    description: string;
    quantity: string;
    unitPrice: string;
  }[];
};
// Legacy aggregates become a single row per direction, preserving quantity and price.
export function annexTransportRows(
  transport?: Transport,
): NonNullable<Transport["rows"]> {
  if (transport?.rows !== undefined) return transport.rows;
  return (["outbound", "return"] as const).flatMap((direction) => {
    const row = transport?.[direction];
    return row && Number(row.quantity) > 0
      ? [
          {
            ...row,
            id: `legacy-${direction}`,
            direction,
            description:
              direction === "outbound"
                ? "Transporte de ida"
                : "Transporte de regreso",
          },
        ]
      : [];
  });
}
// Manual transport is additive, never discounted by equipment discounts.
export function annexTransportTotals(transport?: Transport) {
  const charge = (row?: { quantity: string; unitPrice: string }) => {
    if (!row) return 0n;
    if (
      !/^\d{1,4}$/.test(row.quantity) ||
      !/^\d{1,10}(\.\d{1,2})?$/.test(row.unitPrice)
    )
      throw new Error("Transporte inválido");
    const [whole, fraction = ""] = row.unitPrice.split(".");
    return (
      BigInt(row.quantity) *
      (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")))
    );
  };
  const sum = (direction: "outbound" | "return") =>
    transport?.rows !== undefined
      ? transport.rows
          .filter((row) => row.direction === direction)
          .reduce((total, row) => total + charge(row), 0n)
      : charge(transport?.[direction]);
  const outbound = sum("outbound"),
    returning = sum("return");
  const amount = (cents: bigint) =>
    `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
  return {
    outbound: amount(outbound),
    return: amount(returning),
    total: amount(outbound + returning),
  };
}
export function annexAmounts(
  totals: { rentalGross: string; rentalDiscount: string; rentalNet: string },
  transport: Parameters<typeof annexTransportTotals>[0],
  vatPercent: number,
  additionalCharges: { quantity: string; unitPrice: string }[] = [],
) {
  const shipping = annexTransportTotals(transport);
  const add = (a: string, b: string) => {
    if (![a, b].every((value) => /^\d+\.\d{2}$/.test(value)))
      throw new Error("Importe inválido");
    const cents = BigInt(a.replace(".", "")) + BigInt(b.replace(".", ""));
    return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
  };
  const extras = additionalCharges.reduce(
    (total, row) =>
      add(
        total,
        annexTransportTotals({
          outbound: row,
          return: { quantity: "0", unitPrice: "0" },
        }).total,
      ),
    "0.00",
  );
  const base = add(add(totals.rentalGross, shipping.total), extras);
  const subtotal = add(add(totals.rentalNet, shipping.total), extras);
  return {
    base,
    subtotal,
    discount: totals.rentalDiscount,
    transport: shipping,
    ...annexTaxTotals(subtotal, vatPercent),
  };
}
