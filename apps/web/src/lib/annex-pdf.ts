import { annexTaxTotals } from "./annex-totals";
import { annexReviewNotices } from "./annex-review";
import { isDailyAnnex } from "./annex-daily-scope";
import { documentBranding, type DocumentBranding } from "./document-branding";
import type { AnnexInput, Result, SourceIssue } from "../app/billing/annexes/types";
import { groupMachineRows, isOpeningBalance, sheetDocuments, sheetRows } from "./annex-sheet";
export type AnnexExport = {
  input: AnnexInput;
  result: Result;
  customer: string;
  worksite: string;
  revision: number;
  issues: SourceIssue[];
  branding?: DocumentBranding;
};
const money = (value: string) => "$ " + Number(value).toLocaleString("es-CO", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const date = (value: string) => value.split("-").reverse().join("/");

/** Both download and print use this document, never a screenshot of the application. */
export async function createAnnexPdf(data: AnnexExport, options: { print?: boolean } = {}): Promise<Blob> {
  if (!isDailyAnnex(data.input)) throw new Error("Esta versión solo permite compartir anexos de alquiler por día.");
  const brand = data.branding ?? documentBranding;
  const logoResponse = await fetch(brand.logoUrl);
  if (!logoResponse.ok) throw new Error("No se pudo cargar el logo de la empresa. Intenta generar el anexo nuevamente.");
  const logo = new Uint8Array(await logoResponse.arrayBuffer());
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  pdf.setProperties({
    title: `Anexo de alquiler - ${data.customer} - ${data.worksite}`,
    subject: `${date(data.input.period.from)} al ${date(data.input.period.to)}`,
    author: brand.companyName,
    creator: "FINGE",
  });
  const dark: [number, number, number] = [28, 40, 49];
  const muted: [number, number, number] = [91, 105, 114];
  const widths = [81, 29, 10, 19, 19, 12, 10, 25, 13, 25, 30];
  const headings = ["Equipo", "Documento", "Cobro", "Desde", "Hasta", "Cant.", "Días", "Precio base", "Dto. %", "Precio final", "Total"];
  const left = 12, right = 285, bottom = 195;
  let y = 0;
  const header = () => {
    pdf.setTextColor(...dark);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    const image = pdf.getImageProperties(logo);
    const scale = Math.min(27 / image.width, 25 / image.height);
    pdf.addImage(logo, "PNG", left, 8, image.width * scale, image.height * scale);
    const company = pdf.splitTextToSize(brand.companyName, 173) as string[];
    pdf.text(company, 45, 13);
    const headingY = 13 + company.length * 4;
    pdf.setFontSize(13);
    pdf.text("ANEXO DE ALQUILER", 45, headingY + 3);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...muted);
    pdf.text(`${date(data.input.period.from)} al ${date(data.input.period.to)}  |  Registros hasta ${date(data.input.period.through)}`, 45, headingY + 9);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.setTextColor(...dark);
    const byX = right - pdf.getTextWidth("FINGE") - 2;
    pdf.text("FINGE", right, 15, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text("by", byX, 15, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.text("Finanzas · Inventario · Gestión", right, 20, { align: "right" });
    const boxY = Math.max(35, headingY + 13);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    const customer = pdf.splitTextToSize(data.customer, 153) as string[];
    const site = pdf.splitTextToSize(data.worksite, 101) as string[];
    const boxHeight = 8 + Math.max(customer.length, site.length) * 3.8;
    pdf.setFillColor(...dark);
    pdf.roundedRect(left, boxY, 273, boxHeight, 2, 2, "F");
    pdf.setTextColor(192, 205, 215);
    pdf.setFontSize(6.5);
    pdf.text("CLIENTE", left + 3, boxY + 4);
    pdf.text("OBRA", 178, boxY + 4);
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(9);
    pdf.text(customer, left + 3, boxY + 8.5);
    pdf.text(site, 178, boxY + 8.5);
    y = boxY + boxHeight + 4;
  };
  const tableHeader = () => {
    pdf.setFillColor(233, 238, 241);
    pdf.rect(left, y, 273, 7, "F");
    pdf.setTextColor(...dark);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    let x = left;
    headings.forEach((label, i) => { pdf.text(label, x + 1.4, y + 4.5); x += widths[i]; });
    y += 7;
  };
  const nextPage = (table = false) => {
    pdf.addPage(); header();
    if (table) tableHeader();
  };
  header(); tableHeader();
  let rowIndex = 0;
  for (const row of groupMachineRows(data.input, sheetRows(data.input, data.result), false)) {
    if (row.group) continue;
    const documents = isOpeningBalance(data.input, row) ? "Saldo inicial" :
      sheetDocuments(data.input, row).map((doc) => doc.label).join("\n") || "-";
    const values = [
      row.supplement ? `${row.label} - Ajuste al mínimo` : row.label,
      documents, row.mode, date(row.from), date(row.to), row.quantity, row.days,
      row.included ? "Incluido" : money(row.basePrice),
      Number(row.discountPercent).toLocaleString("es-CO", { maximumFractionDigits: 6 }),
      row.included ? "-" : row.effectivePrice ? money(row.effectivePrice) : "-",
      row.included ? "Incluido" : row.status === "Revisar modalidad" ? "Por revisar" :
        row.net ? money(row.net) : row.status === "Falta reporte" ? "Pendiente" : "Sin cobro",
    ];
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7);
    const cells = values.map((value, i) => pdf.splitTextToSize(value, widths[i] - 3) as string[]);
    // Split exceptionally long cells safely across pages, repeating the document header.
    const count = Math.max(...cells.map((cell) => cell.length));
    let offset = 0;
    while (offset < count) {
      if (y + 5 > bottom) nextPage(true);
      const capacity = Math.max(1, Math.floor((bottom - y - 2) / 3));
      const take = Math.min(capacity, count - offset);
      const height = Math.max(5, take * 3 + 2);
      if (rowIndex % 2 === 1) {
        pdf.setFillColor(247, 249, 250); pdf.rect(left, y, 273, height, "F");
      }
      pdf.setTextColor(...dark); pdf.setFont("helvetica", "normal"); pdf.setFontSize(7);
      let x = left;
      cells.forEach((cell, i) => {
        const lines = cell.slice(offset, offset + take);
        if (lines.length) pdf.text(lines, i >= 5 ? x + widths[i] - 1.5 : x + 1.5, y + 3.5, { align: i >= 5 ? "right" : "left" });
        x += widths[i];
      });
      pdf.setDrawColor(218, 226, 231); pdf.setLineWidth(0.15);
      pdf.line(left, y + height, right, y + height);
      y += height; offset += take;
      if (offset < count) nextPage(true);
    }
    rowIndex++;
  }
  y += 3;
  if (y + 42 > bottom) nextPage();
  const tax = annexTaxTotals(data.result.totals.rentalNet, data.input.policy.vatPercent ?? 0);
  const breakdown = [
    ["Valor base", money(data.result.totals.rentalGross)],
    ["Descuentos y exenciones", "- " + money(data.result.totals.rentalDiscount)],
    ["Subtotal", money(data.result.totals.rentalNet)],
    [`IVA (${data.input.policy.vatPercent ?? 0} %)`, money(tax.vat)],
    ["TOTAL A PAGAR", money(tax.total)],
  ];
  pdf.setFillColor(240, 244, 246); pdf.roundedRect(173, y, 112, 42, 2, 2, "F");
  breakdown.forEach(([label, value], i) => {
    const total = i === 4;
    if (total) {
      pdf.setFillColor(...dark); pdf.rect(173, y + 32, 112, 10, "F");
      pdf.setTextColor(255, 255, 255);
    } else pdf.setTextColor(...dark);
    pdf.setFont("helvetica", total ? "bold" : "normal"); pdf.setFontSize(total ? 10 : 8);
    pdf.text(label, 177, y + 6 + i * 7.5);
    pdf.text(value, 281, y + 6 + i * 7.5, { align: "right" });
  });
  const summaryY = y;
  y += 48;
  const pending = [...new Set([
    ...annexReviewNotices(data.issues, data.input).map((i) => i.message),
    ...data.result.issues.map((i) => i.message),
  ])];
  if (pending.length) {
    pdf.setFontSize(7); pdf.setFont("helvetica", "normal");
    const beside = pending.flatMap((item) => pdf.splitTextToSize(`- ${item}`, 151) as string[]);
    const fitsBeside = beside.length * 3.5 + 9 <= 42;
    const lines = fitsBeside ? beside : pending.flatMap((item) => pdf.splitTextToSize(`- ${item}`, 267) as string[]);
    if (fitsBeside) y = summaryY;
    else if (y + 12 > bottom) nextPage();
    pdf.setTextColor(...muted); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8);
    pdf.text("Observaciones para revisión", left, y + 4); y += 9;
    for (const line of lines) {
      if (y + 4 > bottom) nextPage();
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(...muted);
      pdf.text(line, left + 2, y); y += 3.5;
    }
  }
  const count = pdf.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    pdf.setPage(page); pdf.setDrawColor(218, 226, 231); pdf.line(left, 199, right, 199);
    pdf.setTextColor(...muted); pdf.setFont("helvetica", "normal"); pdf.setFontSize(7);
    pdf.text(`Generado con FINGE | Anexo de alquiler, no es una factura${data.revision ? ` | Versión ${data.revision}` : ""}`, left, 203);
    pdf.text(`Página ${page} de ${count}`, right, 203, { align: "right" });
  }
  if (options.print) pdf.autoPrint();
  return pdf.output("blob");
}
