import {
  balanceItemLabel,
  balanceLocationLabels,
  balanceReportFileName,
  summarizeBalances,
} from './balance-report';
import type { BalanceReport } from './balance-report';
import type { CellValue, Worksheet } from 'exceljs';

type Column = { title: string; width: number; numeric?: boolean };
function addTable(
  sheet: Worksheet,
  report: BalanceReport,
  columns: Column[],
  values: CellValue[][],
) {
  sheet.columns = columns.map((column) => ({ width: column.width }));
  const filterText = [
    report.filters.customer,
    report.filters.worksite,
    report.filters.provider,
    report.filters.warehouse,
    report.filters.ownership === 'ALL'
      ? null
      : report.filters.ownership === 'INTERNAL'
        ? 'Inventario propio'
        : 'Inventario de proveedores',
  ]
    .filter(Boolean)
    .join(' · ');
  sheet.addRows([
    [report.title],
    [
      `Consulta: ${new Date(report.queriedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })} (Bogotá)`,
    ],
    [filterText || 'Sin filtros adicionales'],
    [report.scope],
    [
      report.warnings.length
        ? report.warnings.join(' ')
        : `${values.length} filas. Cantidades de inventario, no valores de dinero.`,
    ],
  ]);
  for (let row = 1; row <= 5; row++) {
    sheet.mergeCells(row, 1, row, columns.length);
    sheet.getRow(row).height = row === 4 || row === 5 ? 36 : 25;
    sheet.getCell(row, 1).alignment = { wrapText: true, vertical: 'middle' };
    sheet.getCell(row, 1).font = {
      name: 'Arial',
      size: row === 1 ? 15 : 10,
      bold: row === 1,
      color: {
        argb: row === 5 && report.warnings.length ? 'FF9A3412' : 'FF17365D',
      },
    };
  }
  sheet.addRow(columns.map((column) => column.title));
  const header = sheet.getRow(6);
  header.height = 30;
  header.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF17365D' },
    };
    cell.font = {
      name: 'Arial',
      size: 10,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.alignment = { wrapText: true, vertical: 'middle' };
  });
  for (const valuesRow of values) {
    const row = sheet.addRow(valuesRow);
    row.height = 30;
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.alignment = {
        vertical: 'middle',
        wrapText: true,
        horizontal: columns[column - 1]?.numeric ? 'right' : 'left',
      };
      if (columns[column - 1]?.numeric) cell.numFmt = '#,##0.####';
      if (row.number % 2)
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F6FA' },
        };
    });
  }
  sheet.autoFilter = {
    from: { row: 6, column: 1 },
    to: { row: Math.max(6, sheet.rowCount), column: columns.length },
  };
  sheet.views = [{ state: 'frozen', ySplit: 6, showGridLines: false }];
  sheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  sheet.pageSetup.printTitlesRow = '1:6';
  if (!values.length)
    sheet.addRow(['Sin saldos para los filtros seleccionados.']);
}

/** Build locally from one immutable, complete API snapshot; no further requests. */
export async function buildBalanceWorkbook(report: BalanceReport) {
  if (report.rowCount !== report.rows.length)
    throw new Error('El reporte está incompleto. No se generó el Excel.');
  if (report.rows.some((row) => !Number.isFinite(row.quantity)))
    throw new Error('El reporte contiene una cantidad inválida.');
  const { Workbook } = await import('exceljs');
  const book = new Workbook();
  book.creator = 'REV · Inventario';
  book.created = new Date(report.queriedAt);
  const summary = book.addWorksheet('Saldos');
  const columns: Column[] = [];
  const prefix: ((
    row: ReturnType<typeof summarizeBalances>[number],
  ) => CellValue)[] = [];
  if (report.report === 'customers' || report.report === 'worksites') {
    columns.push({ title: 'Cliente', width: 32 });
    prefix.push((row) => row.customer);
  }
  if (report.report === 'worksites') {
    columns.push({ title: 'Obra', width: 30 }, { title: 'Alias', width: 24 });
    prefix.push(
      (row) => row.worksite,
      (row) => row.alias,
    );
  }
  if (report.report === 'warehouses') {
    columns.push({ title: 'Bodega física', width: 32 });
    prefix.push((row) => row.warehouse);
  }
  columns.push(
    { title: 'Referencia / equipo', width: 52 },
    { title: 'Control', width: 18 },
    { title: 'Propietario', width: 30 },
    { title: 'Bodega propietaria', width: 32 },
  );
  const splitLocations =
    report.report === 'general' || report.report === 'providers';
  if (splitLocations)
    columns.push(
      { title: 'En bodega', width: 16, numeric: true },
      { title: 'En obra', width: 16, numeric: true },
      { title: 'En tránsito', width: 16, numeric: true },
      { title: 'Sin confirmar', width: 16, numeric: true },
    );
  columns.push({ title: 'Saldo', width: 16, numeric: true });
  addTable(
    summary,
    report,
    columns,
    summarizeBalances(report).map((row) => [
      ...prefix.map((get) => get(row)),
      row.reference,
      row.type,
      row.owner,
      row.ownerWarehouse,
      ...(splitLocations
        ? [
            row.warehouseQuantity,
            row.worksiteQuantity,
            row.transitQuantity,
            row.unknownQuantity,
          ]
        : []),
      row.quantity,
    ]),
  );
  const detail = book.addWorksheet('Detalle por ubicación');
  addTable(
    detail,
    report,
    [
      { title: 'Cliente', width: 32 },
      { title: 'Obra', width: 30 },
      { title: 'Alias', width: 24 },
      { title: 'Estado', width: 20 },
      { title: 'Ubicación', width: 32 },
      { title: 'Propietario', width: 30 },
      { title: 'Bodega propietaria', width: 32 },
      { title: 'Referencia / equipo', width: 52 },
      { title: 'Identificación', width: 22 },
      { title: 'Control', width: 18 },
      { title: 'Implemento', width: 16 },
      { title: 'Saldo', width: 16, numeric: true },
    ],
    report.rows.map((row) => [
      row.customerName,
      row.worksiteName,
      row.worksiteAlias,
      balanceLocationLabels[row.locationType],
      row.locationName,
      row.ownerName,
      row.ownerWarehouseName,
      row.reference,
      row.identification,
      row.controlType === 'BULK' ? 'Por cantidad' : 'Equipo',
      row.isImplement ? 'Sí' : 'No',
      row.quantity,
    ]),
  );
  return book;
}

export async function downloadBalanceExcel(report: BalanceReport) {
  const book = await buildBalanceWorkbook(report);
  const data = await book.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(data)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = balanceReportFileName(report);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
