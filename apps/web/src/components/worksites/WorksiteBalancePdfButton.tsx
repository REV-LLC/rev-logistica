'use client';

import { useState } from 'react';
import { Button } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';

type BalanceItem = {
  type: 'Masivo' | 'Equipo';
  reference: string;
  identifier: string;
  owner: string;
  quantity: number;
};

type WorksiteBalancePdfButtonProps = {
  customerName: string;
  worksiteName: string;
  worksiteAlias?: string | null;
  address?: string | null;
  bulk: {
    skuName: string | null;
    ownerWarehouseName?: string | null;
    quantity: number;
  }[];
  serial: {
    serialOrEngine: string | null;
    description: string | null;
    skuName?: string | null;
    ownerWarehouseName?: string | null;
    quantity: number;
  }[];
};

const TABLE_COLUMNS = [
  { label: 'Tipo', width: 22 },
  { label: 'Referencia', width: 62 },
  { label: 'Identificación', width: 34 },
  { label: 'Bodega dueña', width: 44 },
  { label: 'Saldo', width: 20 },
] as const;

function sanitizeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function buildBalanceItems(
  bulk: WorksiteBalancePdfButtonProps['bulk'],
  serial: WorksiteBalancePdfButtonProps['serial'],
) {
  const bulkItems: BalanceItem[] = bulk.map((item) => ({
    type: 'Masivo',
    reference: item.skuName?.trim() || 'Sin referencia',
    identifier: '-',
    owner: item.ownerWarehouseName?.trim() || 'Sin bodega dueña',
    quantity: item.quantity,
  }));

  const serialItems: BalanceItem[] = serial.map((item) => ({
    type: 'Equipo',
    reference: item.description?.trim() || item.skuName?.trim() || 'Equipo sin referencia',
    identifier: item.serialOrEngine?.trim() || '-',
    owner: item.ownerWarehouseName?.trim() || 'Sin bodega dueña',
    quantity: item.quantity,
  }));

  return [...bulkItems, ...serialItems].sort((a, b) =>
    a.reference.localeCompare(b.reference, 'es'),
  );
}

export default function WorksiteBalancePdfButton({
  customerName,
  worksiteName,
  worksiteAlias,
  address,
  bulk,
  serial,
}: WorksiteBalancePdfButtonProps) {
  const [generating, setGenerating] = useState(false);

  const downloadPdf = async () => {
    setGenerating(true);

    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const items = buildBalanceItems(bulk, serial);
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const tableWidth = TABLE_COLUMNS.reduce((sum, column) => sum + column.width, 0);
      const lineHeight = 4.2;
      let y = 16;

      const drawPageHeading = () => {
        doc.setTextColor(27, 38, 54);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('Saldo de inventario en obra', margin, y);
        y += 8;

        doc.setFontSize(11);
        doc.text(`${customerName} / ${worksiteName}`, margin, y);
        y += 5;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(88, 96, 105);
        doc.setFontSize(9);
        if (worksiteAlias) {
          doc.text(`Alias: ${worksiteAlias}`, margin, y);
          y += 4.5;
        }
        if (address) {
          const addressLines = doc.splitTextToSize(`Dirección: ${address}`, tableWidth);
          doc.text(addressLines, margin, y);
          y += addressLines.length * lineHeight;
        }
        doc.text(
          `Generado: ${new Date().toLocaleString('es-CO', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}`,
          margin,
          y,
        );
        y += 7;
      };

      const drawTableHeader = () => {
        let x = margin;
        doc.setFillColor(35, 55, 80);
        doc.rect(margin, y, tableWidth, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);

        TABLE_COLUMNS.forEach((column) => {
          const alignRight = column.label === 'Saldo';
          doc.text(
            column.label,
            alignRight ? x + column.width - 2 : x + 2,
            y + 5.2,
            alignRight ? { align: 'right' } : undefined,
          );
          x += column.width;
        });
        y += 8;
      };

      drawPageHeading();
      drawTableHeader();

      if (items.length === 0) {
        doc.setDrawColor(222, 226, 230);
        doc.setFillColor(248, 249, 250);
        doc.rect(margin, y, tableWidth, 12, 'FD');
        doc.setTextColor(88, 96, 105);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('Esta obra no tiene inventario registrado actualmente.', margin + 3, y + 7.5);
      } else {
        items.forEach((item, index) => {
          const values = [
            item.type,
            item.reference,
            item.identifier,
            item.owner,
            String(item.quantity),
          ];
          const lines = values.map((value, columnIndex) =>
            doc.splitTextToSize(value, TABLE_COLUMNS[columnIndex].width - 4),
          );
          const rowHeight = Math.max(8, Math.max(...lines.map((value) => value.length)) * lineHeight + 3);

          if (y + rowHeight > pageHeight - 16) {
            doc.addPage();
            y = 16;
            drawTableHeader();
          }

          let x = margin;
          doc.setDrawColor(222, 226, 230);
          doc.setFillColor(index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 249 : 255, index % 2 === 0 ? 250 : 255);
          doc.rect(margin, y, tableWidth, rowHeight, 'FD');
          doc.setTextColor(33, 37, 41);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);

          lines.forEach((value, columnIndex) => {
            const column = TABLE_COLUMNS[columnIndex];
            const isQuantity = column.label === 'Saldo';
            doc.text(
              value,
              isQuantity ? x + column.width - 2 : x + 2,
              y + 5,
              isQuantity ? { align: 'right' } : undefined,
            );
            x += column.width;
          });

          y += rowHeight;
        });
      }

      const pageCount = doc.getNumberOfPages();
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        doc.setPage(pageNumber);
        doc.setTextColor(134, 142, 150);
        doc.setFontSize(8);
        doc.text(
          `Página ${pageNumber} de ${pageCount}`,
          pageWidth - margin,
          pageHeight - 8,
          { align: 'right' },
        );
      }

      const fileName = sanitizeFileName(worksiteAlias || worksiteName) || 'obra';
      doc.save(`saldo-obra-${fileName}.pdf`);
    } catch (error) {
      console.error('No se pudo generar el PDF de saldo de obra', error);
      window.alert('No se pudo generar el PDF. Intenta nuevamente.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button
      variant="light"
      color="red"
      leftSection={<IconDownload size={16} />}
      loading={generating}
      onClick={downloadPdf}
    >
      Descargar saldo PDF
    </Button>
  );
}
