import { useState } from "react";
import { Alert, Button, NumberInput, Select, Stack, Text } from "@mantine/core";
import type { AnnexInput, Rental } from "./types";

export function canSetWorksiteRate(rental: Rental) {
  const unit = rental.commercial?.mode?.unit ?? rental.commercial?.catalog?.unit;
  return (!unit || unit === "DAY") && !rental.metering && !rental.cutting &&
    !rental.accessoryId && !rental.includedIn && !rental.commercial?.contextualZero &&
    rental.commercial?.status !== "REVIEW" && rental.commercial?.mode?.pricing.source !== "FIXED";
}

type Choice = "inherit" | "set" | "clear";

export default function WorksiteRateEditor({ input, rental, finalPrice, worksiteName, onApply }: {
  input: AnnexInput;
  rental: Rental;
  finalPrice: string;
  worksiteName: string;
  onApply: (input: AnnexInput) => void;
}) {
  const basis = rental.billingAreaM2 === undefined ? "UNIT" : "AREA_M2";
  const decisions = input.worksiteRates ?? [];
  const existing = decisions.find(rate => rate.skuId === rental.skuId && rate.quantityBasis === basis);
  const [choice, setChoice] = useState<Choice>(existing ? (existing.unitPrice === null ? "clear" : "set") : "inherit");
  const [price, setPrice] = useState<string | number>(() => new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2, useGrouping: false,
  }).format(Number(existing?.unitPrice ?? finalPrice)));
  const [error, setError] = useState("");

  function apply() {
    const other = decisions.filter(rate => rate.skuId !== rental.skuId || rate.quantityBasis !== basis);
    if (choice === "set" && !/^\d{1,10}(\.\d{1,2})?$/.test(String(price))) {
      setError("Escribe un precio en COP con hasta dos decimales.");
      return;
    }
    if (choice !== "inherit") {
      other.push({ skuId: rental.skuId, quantityBasis: basis, unitPrice: choice === "clear" ? null : String(price) });
    }
    onApply({ ...input, worksiteRates: other.length ? other : undefined });
  }

  return <Stack gap="sm">
    <Text size="sm">Al guardar el anexo, esta decisión se aplicará a los cortes de <b>{worksiteName}</b> que comiencen después del {input.period.to.split("-").reverse().join("/")}.</Text>
    {rental.pricing.adjustmentSource === "WORKSITE" && <Text size="sm">
      Tarifa de la obra aplicada en este corte: {new Intl.NumberFormat("es-CO", {
        style: "currency", currency: "COP", maximumFractionDigits: 2,
      }).format(Number(rental.pricing.effectivePrice))}.
    </Text>}
    <Select label="Tarifa para los próximos cortes" allowDeselect={false} value={choice}
      onChange={value => { if (value) setChoice(value as Choice); setError(""); }}
      data={[
        { value: "inherit", label: "Mantener la regla anterior" },
        { value: "set", label: "Fijar precio para esta obra" },
        { value: "clear", label: "Volver a la tarifa habitual del cliente o catálogo" },
      ]} />
    {choice === "set" && <NumberInput label={basis === "AREA_M2" ? "Precio por m² y día (COP)" : "Precio por unidad y día (COP)"}
      value={price} onChange={setPrice} min={0} max={9999999999.99} allowNegative={false}
      thousandSeparator="." decimalSeparator="," decimalScale={2} />}
    {error && <Alert color="red" role="alert">{error}</Alert>}
    <Button onClick={apply}>Aplicar al anexo</Button>
  </Stack>;
}
