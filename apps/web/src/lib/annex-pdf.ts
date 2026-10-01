import type {
  AnnexInput,
  Result,
  SourceIssue,
} from "../app/billing/annexes/types";
import { groupMachineRows, sheetRows } from "./annex-sheet";
export type AnnexExport = {
  input: AnnexInput;
  result: Result;
  customer: string;
  worksite: string;
  revision: number;
  issues: SourceIssue[];
};
const money = (value: string) =>
  "$ " +
  Number(value).toLocaleString("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export async function createAnnexPdf(data: AnnexExport): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const widths = [68, 12, 22, 22, 15, 15, 20, 27, 17, 27, 28],
    headings = [
      "Equipo",
      "Cobro",
      "Desde",
      "Hasta",
      "Cant.",
      "Días",
      "H./m cob.",
      "Precio base",
      "Dto. %",
      "Precio final",
      "Total",
    ];
  let y = 14;
  const write = (text: string, size = 9, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, 269) as string[];
    for (const line of lines) {
      if (y > 191) {
        pdf.addPage();
        y = 14;
      }
      pdf.text(line, 14, y);
      y += size * 0.45 + 1;
    }
  };
  const tableHeader = () => {
    pdf.setFillColor(231, 240, 250);
    pdf.rect(14, y, 273, 8, "F");
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    let x = 14;
    headings.forEach((label, i) => {
      pdf.text(label, x + 1, y + 5);
      x += widths[i];
    });
    y += 8;
  };
  write(data.customer, 16, true);
  write(data.worksite, 11, true);
  write(
    `ANEXO DE ALQUILER | ${data.input.period.from} al ${data.input.period.to} | Registros hasta ${data.input.period.through}`,
  );
  write(
    data.revision
      ? `Versión guardada ${data.revision}`
      : "Consulta sin guardar",
  );
  write(
    "Alquiler sin IVA ni extras del operario. Documento en revisión; no es una factura.",
  );
  y += 3;
  tableHeader();
  for (const row of groupMachineRows(
    data.input,
    sheetRows(data.input, data.result),
  )) {
    if (row.group) {
      if (y + 16 > 190) {
        pdf.addPage();
        y = 14;
        tableHeader();
      }
      pdf.setFillColor(231, 240, 250);
      pdf.rect(14, y, 273, 8, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.text(
        `${row.label} · Mínimo: ${row.kind === "rentals" ? ((data.input.rentals[row.index].metering ?? data.input.rentals[row.index].cutting) ? (data.input.rentals[row.index].metering ?? data.input.rentals[row.index].cutting)!.minimumMeters + " m/alquiler" : (data.input.policy.minimumDaysByRental?.[row.rentalId!] ?? data.input.policy.minimumDaysBySku?.[row.skuId!] ?? 0) + " días/alquiler") : (data.input.policy.minimumHoursByAsset?.[row.assetId!] ?? data.input.policy.minimumHoursPerMachineDay) + " h/día"}`,
        15,
        y + 5,
      );
      y += 8;
      continue;
    }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    const displayLabel = row.supplement
      ? `${row.label} · Ajuste al mínimo`
      : row.label;
    const label = pdf.splitTextToSize(displayLabel, 66) as string[];
    const height = Math.max(8, label.length * 4 + 3);
    if (y + height > 190) {
      pdf.addPage();
      y = 14;
      tableHeader();
      pdf.setFont("helvetica", "normal");
    }
    const values = [
      displayLabel,
      row.mode,
      row.from,
      row.to,
      row.quantity,
      row.days,
      row.units,
      row.included ? "Incluido" : money(row.basePrice),
      Number(row.discountPercent).toLocaleString("es-CO", {
        maximumFractionDigits: 6,
      }),
      row.included ? "—" : row.effectivePrice ? money(row.effectivePrice) : "—",
      row.included
        ? "Incluido"
        : row.status === "Revisar modalidad"
          ? "Por revisar"
          : row.net
            ? money(row.net)
            : row.status === "Falta reporte"
              ? "Pendiente"
              : "Sin cobro",
    ];
    let x = 14;
    values.forEach((value, i) => {
      pdf.text(i === 0 ? label : value, x + 1, y + 5);
      x += widths[i];
    });
    pdf.setDrawColor(220, 226, 233);
    pdf.line(14, y + height, 287, y + height);
    y += height;
  }
  y += 8;
  write(`TOTAL ALQUILER: ${money(data.result.totals.rentalNet)}`, 12, true);
  write(
    `Base: ${money(data.result.totals.rentalGross)} | Descuentos y exenciones: ${money(data.result.totals.rentalDiscount)}`,
  );
  const pending = [
    ...new Set([
      ...data.issues.map((i) => i.message),
      ...data.result.issues.map((i) => i.message),
    ]),
  ];
  if (pending.length) {
    y += 4;
    write("Pendientes de revisión", 10, true);
    pending.forEach((item) => write(`- ${item}`, 8));
  }
  const count = pdf.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    pdf.setPage(page);
    pdf.setFontSize(8);
    pdf.text(`Página ${page} de ${count}`, 283, 202, { align: "right" });
  }
  return pdf.output("blob");
}
