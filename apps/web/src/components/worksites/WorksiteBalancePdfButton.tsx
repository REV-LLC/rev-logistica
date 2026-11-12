'use client';

import { useId, useState } from 'react';
import { Alert, Button, Checkbox, Group, Popover, Stack, Text } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { balancePdfColumns, defaultBalancePdfColumns, type BalancePdfColumn, type WorksiteBalancePdfData } from '@/lib/worksite-balance-pdf';

export default function WorksiteBalancePdfButton(data: WorksiteBalancePdfData) {
  const headingId = useId();
  const [opened, setOpened] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [columns, setColumns] = useState<BalancePdfColumn[]>(() => [...defaultBalancePdfColumns]);
  const [error, setError] = useState<string | null>(null);

  async function downloadPdf() {
    if (generating || !columns.length) return;
    setGenerating(true); setError(null);
    try {
      const { createWorksiteBalancePdf, worksiteBalancePdfFilename } = await import('@/lib/worksite-balance-pdf');
      const blob = await createWorksiteBalancePdf(data, { columns });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = worksiteBalancePdfFilename(data);
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setOpened(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo generar el PDF. Intenta nuevamente.');
    } finally { setGenerating(false); }
  }

  return <Popover opened={opened} onChange={value => { if (!generating) setOpened(value); }} position="bottom-end" withArrow shadow="md" withinPortal>
    <Popover.Target>
      <Button variant="light" color="red" leftSection={<IconDownload size={16} />} disabled={generating}
        aria-expanded={opened} aria-haspopup="dialog" onClick={() => setOpened(value => !value)}>
        Descargar saldo PDF
      </Button>
    </Popover.Target>
    <Popover.Dropdown role="dialog" aria-labelledby={headingId} style={{ width: 300, maxWidth: 'calc(100vw - 24px)' }}>
      <Stack gap="sm">
        <Text id={headingId} fw={700}>Columnas del PDF</Text>
        {balancePdfColumns.map(column => <Checkbox key={column.key} label={column.label} checked={columns.includes(column.key)} disabled={generating}
          onChange={event => {
            const checked = event.currentTarget.checked;
            setColumns(current => checked ? [...current, column.key] : current.filter(key => key !== column.key));
          }} />)}
        {error ? <Alert color="red" role="alert">{error}</Alert> : null}
        <Group justify="flex-end" gap="xs" mt="xs">
          <Button variant="default" disabled={generating} onClick={() => setOpened(false)}>Cancelar</Button>
          <Button leftSection={<IconDownload size={16} />} loading={generating} disabled={!columns.length} onClick={() => void downloadPdf()}>Generar PDF</Button>
        </Group>
      </Stack>
    </Popover.Dropdown>
  </Popover>;
}
