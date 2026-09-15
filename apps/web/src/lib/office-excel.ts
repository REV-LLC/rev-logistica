import { columnLabel, officeExcelValue } from './office-report';
import type { OfficeReply } from './office-report';

/** Entirely local export of the displayed snapshot. No API call, SQL, or AI. */
export async function buildOfficeWorkbook(reply: OfficeReply, question: string) {
  const { Workbook } = await import('exceljs');
  const book = new Workbook();
  book.creator = 'REV · Asistente Office';
  book.created = new Date(reply.queriedAt);
  const summary = book.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
  summary.columns = [{ width: 24 }, { width: 100 }];
  summary.addRows([[], ['Asistente Office REV'], [], ['Pregunta', question],
    ['Consultado en Bogotá', new Date(reply.queriedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })],
    ['Respuesta', reply.answer],
    ['Alcance', 'Copia de las tablas consultadas. No se actualiza automáticamente.'],
    ['Resultados', reply.evidence.some((source) => source.truncated)
      ? 'PARCIAL: hay fuentes recortadas. No representan necesariamente todos los registros.'
      : 'Incluye las filas recibidas de cada consulta, con sus filtros y agrupaciones.'],
    ['Formato', 'Fechas en hora de Bogotá. Cifras de más de 15 dígitos se conservan como texto para no perder precisión.'],
  ]);
  summary.getCell('A2').font = { name: 'Arial', size: 14, bold: true };
  summary.eachRow((row, index) => {
    if (index === 2) return;
    row.eachCell((cell) => { cell.font = { name: 'Arial', size: 10 }; cell.alignment = { wrapText: true, vertical: 'top' }; });
    row.height = Math.max(28, Math.ceil(String(row.getCell(2).value ?? '').split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 100)), 0) * 15));
  });
  for (const [index, source] of reply.evidence.entries()) {
    const sheet = book.addWorksheet(`Consulta ${index + 1}`, { views: [{ state: 'frozen', ySplit: 7, showGridLines: false }] });
    sheet.addRows([[], [`[${source.id}] ${source.title}`],
      [`Fuente: base de datos REV. Consulta: ${new Date(source.queriedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })} (Bogotá)`],
      [source.truncated ? 'RESULTADO PARCIAL: se exportan únicamente las filas recibidas. Solicita un resumen para los totales completos.' : `${source.rowCount} filas recibidas. Las filas pueden estar agrupadas; no son un total de unidades.`],
      ['Fechas en hora de Bogotá. Las celdas vacías indican datos no disponibles.'], [],
      source.columns.map(columnLabel),
      ...source.rows.map((row) => source.columns.map((column) => officeExcelValue(column, row[column], source.columnTypes?.[column]))),
    ]);
    sheet.getCell('A2').font = { name: 'Arial', size: 14, bold: true };
    sheet.getRow(7).height = 32;
    sheet.getRow(7).eachCell((cell) => {
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    source.columns.forEach((column, offset) => {
      const excelColumn = sheet.getColumn(offset + 1);
      excelColumn.width = Math.min(54, Math.max(18, columnLabel(column).length + 2,
        ...source.rows.map((row) => String(officeExcelValue(column, row[column], source.columnTypes?.[column]) ?? '').length + 2)));
      for (let i = 8; i <= sheet.rowCount; i++) {
        const cell = sheet.getCell(i, offset + 1);
        cell.font = { name: 'Arial', size: 10 };
        cell.alignment = { vertical: 'top', wrapText: true, horizontal: typeof cell.value === 'number' ? 'right' : 'left' };
        if (cell.value instanceof Date) cell.numFmt = source.columnTypes?.[column] === 'date' ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm';
        else if (typeof cell.value === 'number') cell.numFmt = '#,##0.###############';
        if (i % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F5F9' } };
      }
    });
    for (let i = 8; i <= sheet.rowCount; i++) {
      let lines = 1;
      sheet.getRow(i).eachCell((cell, column) => { lines = Math.max(lines, Math.ceil(String(cell.value ?? '').length / (sheet.getColumn(column).width ?? 18))); });
      sheet.getRow(i).height = Math.max(24, lines * 15);
    }
    if (source.columns.length) sheet.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7 + source.rows.length, column: source.columns.length } };
  }
  return book;
}

export async function downloadOfficeExcel(reply: OfficeReply, question: string) {
  const book = await buildOfficeWorkbook(reply, question);
  const buffer = await book.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `REV-consulta-${reply.queriedAt.slice(0, 10)}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
