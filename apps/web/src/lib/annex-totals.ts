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
