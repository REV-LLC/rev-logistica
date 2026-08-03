'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Container,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

type SharedDocument = {
  id: string;
  type: string;
  status: string;
  consecutive: string | null;
  docDate: string;
  notes: string | null;
  customerWorksite?: {
    alias?: string | null;
    customer?: { name: string } | null;
    worksite?: { name: string; address?: string | null } | null;
  } | null;
  items: Array<{
    id: string;
    quantity?: string | number | null;
    requestedTag?: string | null;
    conditionNote?: string | null;
    sku?: { name: string } | null;
    asset?: {
      serialOrEngine?: string | null;
      description?: string | null;
      internalNumber?: number | null;
      sku?: { name: string } | null;
    } | null;
  }>;
};

function itemName(item: SharedDocument['items'][number]) {
  return item.asset?.description
    || item.asset?.sku?.name
    || item.sku?.name
    || item.requestedTag
    || 'Ítem';
}

export default function SharedDocumentPage() {
  const params = useParams<{ shareToken: string }>();
  const [document, setDocument] = useState<SharedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.shareToken) return;
    api<SharedDocument>(`/public/documents/${params.shareToken}`, {
      auth: false,
      redirectOnAuthError: false,
    }).then(setDocument).catch(() => {
      setError('No se encontró el documento o el enlace no es válido.');
    });
  }, [params.shareToken]);

  if (error) {
    return (
      <Container size="sm" py="xl">
        <Alert color="red">{error}</Alert>
      </Container>
    );
  }
  if (!document) {
    return (
      <Container size="sm" py="xl">
        <Group justify="center"><Loader /></Group>
      </Container>
    );
  }

  const label = document.type === 'REMISSION' ? 'Remisión'
    : document.type === 'RETURN' ? 'Devolución' : 'Documento';
  return (
    <main>
      <Container size="md" py="xl">
        <Stack gap="lg">
          <Paper withBorder radius="lg" p="lg">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text size="sm" c="dimmed">REV Logística</Text>
                <Title order={2}>{label} {document.consecutive ?? ''}</Title>
                <Text size="sm">
                  {new Date(document.docDate).toLocaleDateString('es-CO')}
                </Text>
              </div>
              <Badge variant="light">{document.status}</Badge>
            </Group>
            <Stack gap={4} mt="md">
              <Text fw={700}>{document.customerWorksite?.customer?.name ?? 'Cliente'}</Text>
              <Text size="sm">
                {document.customerWorksite?.alias
                  || document.customerWorksite?.worksite?.name
                  || 'Obra'}
              </Text>
              {document.customerWorksite?.worksite?.address ? (
                <Text size="sm" c="dimmed">
                  {document.customerWorksite.worksite.address}
                </Text>
              ) : null}
            </Stack>
          </Paper>

          <Paper withBorder radius="lg" p="lg">
            <Title order={3} mb="md">Detalle</Title>
            <Table.ScrollContainer minWidth={520}>
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Ítem</Table.Th>
                    <Table.Th>Serial</Table.Th>
                    <Table.Th>Cantidad</Table.Th>
                    <Table.Th>Observación</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {document.items.map((item) => (
                    <Table.Tr key={item.id}>
                      <Table.Td>{itemName(item)}</Table.Td>
                      <Table.Td>{item.asset?.serialOrEngine ?? '-'}</Table.Td>
                      <Table.Td>{item.quantity ?? 1}</Table.Td>
                      <Table.Td>{item.conditionNote ?? '-'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        </Stack>
      </Container>
    </main>
  );
}
