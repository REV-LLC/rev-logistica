import { annexTaxTotals } from "./annex-totals";
import { annexReviewNotices } from "./annex-review";
import { isDailyAnnex } from "./annex-daily-scope";
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
export async function createAnnexPdf(data: AnnexExport, options: { print?: boolean } = {}): Promise<Blob> {
  if (!isDailyAnnex(data.input))
    throw new Error(
      "Esta versión solo permite compartir anexos de alquiler por día.",
    );
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const widths = [88, 12, 22, 22, 15, 15, 27, 17, 27, 28],
    headings = [
      "Equipo",
      "Cobro",
      "Desde",
      "Hasta",
      "Cant.",
      "Días",
      "Precio base",
      "Dto. %",
      "Precio final",
      "Total",
    ];
  const paintPage = () => {
    pdf.setFillColor(25, 33, 39);
    pdf.rect(0, 0, 297, 210, "F");
    pdf.setFillColor(38, 49, 58);
    pdf.roundedRect(8, 8, 281, 188, 4, 4, "F");
    pdf.setDrawColor(72, 88, 100);
    pdf.roundedRect(8, 8, 281, 188, 4, 4, "S");
    pdf.setTextColor(237, 243, 248);
  };
  const addPage = () => {
    pdf.addPage();
    paintPage();
  };
  paintPage();
  let y = 18;
  const write = (text: string, size = 9, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, 269) as string[];
    for (const line of lines) {
      if (y > 191) {
        addPage();
        y = 18;
      }
      pdf.text(line, 14, y);
      y += size * 0.45 + 1;
    }
  };
  const tableHeader = () => {
    pdf.setFillColor(52, 69, 82);
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
  write("Alquiler por día. Documento para revisión; no es una factura.");
  y += 3;
  tableHeader();
  for (const row of groupMachineRows(
    data.input,
    sheetRows(data.input, data.result),
    false,
  )) {
    if (row.group) {
      if (y + 16 > 190) {
        addPage();
        y = 18;
        tableHeader();
      }
      pdf.setFillColor(52, 69, 82);
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
    const label = pdf.splitTextToSize(displayLabel, 86) as string[];
    const height = Math.max(8, label.length * 4 + 3);
    if (y + height > 190) {
      addPage();
      y = 18;
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
    pdf.setDrawColor(72, 88, 100);
    pdf.line(14, y + height, 287, y + height);
    y += height;
  }
  y += 8;
  if (y + 58 > 190) {
    addPage();
    y = 18;
  }
  const tax = annexTaxTotals(
    data.result.totals.rentalNet,
    data.input.policy.vatPercent ?? 0,
  );
  pdf.setFillColor(45, 59, 70);
  pdf.roundedRect(165, y, 122, 56, 3, 3, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text("Alquiler calculado", 281, y + 8, { align: "right" });
  const breakdown = [
    ["Valor base", money(data.result.totals.rentalGross)],
    [
      "Descuentos y exenciones",
      "- " + money(data.result.totals.rentalDiscount),
    ],
    ["Subtotal", money(data.result.totals.rentalNet)],
    [`IVA (${data.input.policy.vatPercent ?? 0} %)`, money(tax.vat)],
    ["Total a pagar", money(tax.total)],
  ];
  breakdown.forEach(([label, value], index) => {
    const total = index === breakdown.length - 1;
    pdf.setFont("helvetica", total ? "bold" : "normal");
    pdf.setFontSize(total ? 11 : 9);
    const lineY = y + 18 + index * 8;
    if (total) {
      pdf.setDrawColor(114, 145, 166);
      pdf.line(171, lineY - 5, 281, lineY - 5);
    }
    pdf.text(label, 171, lineY);
    pdf.text(value, 281, lineY, { align: "right" });
  });
  y += 62;
  const pending = [
    ...new Set([
      ...annexReviewNotices(data.issues, data.input).map((i) => i.message),
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
  if (options.print) pdf.autoPrint();
  return pdf.output("blob");
}
