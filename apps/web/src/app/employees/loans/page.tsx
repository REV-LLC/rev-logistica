'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Container, Group, Loader, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconArrowRight } from '@tabler/icons-react';
import { api } from '@/lib/api';

type LoanSummary = {
  id: string;
  name: string;
  lastName: string;
  documentId: string | null;
  opening: string | null;
  balance: string;
  lastPayment: { amount: string; date: string | null } | null;
};
const currency = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
const money = (value: string) => currency.format(Number(value));
const dateLabel = (value: string | null) => value ? value.slice(0, 10).split('-').reverse().join('/') : 'Sin fecha registrada';

export default function EmployeeLoansPage() {
  const [rows, setRows] = useState<LoanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api<LoanSummary[]>('/employees/loans', { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setRows(result); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los préstamos.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  return <Container size="xl" py="xl"><Stack gap="lg">
    <Group><Button component={Link} href="/employees" variant="subtle" leftSection={<IconArrowLeft size={16} />}>Empleados</Button></Group>
    <div><Title order={1}>Préstamos de empleados</Title><Text c="dimmed">Consulta los saldos y abre la tarjeta de cada empleado para ver sus movimientos.</Text></div>
    {loading ? <Loader aria-label="Cargando préstamos" /> : error ? <Alert color="red" title="No se pudo cargar la información">
      <Stack gap="sm"><Text>{error}</Text><Button variant="light" onClick={() => setAttempt(value => value + 1)}>Reintentar</Button></Stack>
    </Alert> : <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
      <div role="region" aria-label="Préstamos de todos los empleados" tabIndex={0} style={{ overflow: 'auto', maxHeight: '70dvh' }}>
        <Table stickyHeader stickyHeaderOffset={0} highlightOnHover verticalSpacing="md" horizontalSpacing="md" miw={900}>
          <Table.Caption>Los cargos aumentan la deuda y los abonos la reducen. Último pago muestra el abono con la fecha más reciente.</Table.Caption>
          <Table.Thead><Table.Tr>
            <Table.Th>Empleado</Table.Th><Table.Th>Cédula</Table.Th><Table.Th ta="right">Valor inicial</Table.Th>
            <Table.Th ta="right">Deuda actual</Table.Th><Table.Th>Último pago</Table.Th><Table.Th>Acciones</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>{rows.map(row => <Table.Tr key={row.id}>
            <Table.Td><Text fw={600} size="sm">{row.name} {row.lastName}</Text></Table.Td>
            <Table.Td><Text size="sm">{row.documentId || 'Sin registrar'}</Text></Table.Td>
            <Table.Td ta="right" style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{row.opening === null ? <Text size="sm" c="dimmed">Sin registrar</Text> : money(row.opening)}</Table.Td>
            <Table.Td ta="right" fw={700} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{money(row.balance)}</Table.Td>
            <Table.Td>{row.lastPayment ? <><Text size="sm" fw={500} style={{ whiteSpace: 'nowrap' }}>{money(row.lastPayment.amount)}</Text><Text size="xs" c="dimmed">{dateLabel(row.lastPayment.date)}</Text></> : <Text size="sm" c="dimmed">Sin pagos</Text>}</Table.Td>
            <Table.Td><Button component={Link} href={`/employees/${row.id}/loans`} size="xs" variant="light" rightSection={<IconArrowRight size={14} />} aria-label={`Abrir préstamos de ${row.name} ${row.lastName}`}>Abrir</Button></Table.Td>
          </Table.Tr>)}</Table.Tbody>
        </Table>
        {!rows.length ? <Text c="dimmed" ta="center" p="xl">No hay empleados registrados.</Text> : null}
      </div>
    </Paper>}
  </Stack></Container>;
}
