'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import RawJsonPanel from '@/components/RawJsonPanel';
import InventoryDisplay from '@/components/InventoryDisplay';
import { useRouter } from 'next/navigation';
import { Button, Container, Group, Paper, Text, TextInput, Title } from '@mantine/core';

interface InventoryResponse {
  customerWorksiteId: string;
  bulk: {
    skuId: string;
    skuName: string | null;
    imageUrl: string | null;
    imageFileObjectId: string | null;
    quantity: number;
  }[];
  serial: {
    assetId: string;
    serialOrEngine: string | null;
    description: string | null;
    imageFileObjectId: string | null;
    quantity: number;
  }[];
}

export default function OnSiteInventoryPage() {
  const router = useRouter();
  const [customerWorksiteId, setCustomerWorksiteId] = useState('');
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    setUnauthorized(false);

    try {
      const response = await api<InventoryResponse>(
        `/inventory/on-site/${customerWorksiteId}`,
        { method: 'GET' }
      );
      setData(response);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUnauthorized(true);
        return;
      }
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error inesperado.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (unauthorized) {
    return (
      <main>
        <Container size="md" py="xl">
          <Paper shadow="sm" p="xl" radius="md" withBorder>
            <Text c="red" fw={600}>
              No autorizado.
            </Text>
            <Button mt="md" onClick={() => router.replace('/login')}>
              Ir a login
            </Button>
          </Paper>
        </Container>
      </main>
    );
  }

  return (
    <main>
      <Container size="lg" py="xl">
        <Paper shadow="sm" p="xl" radius="md" withBorder>
          <Title order={2}>Inventario On-site</Title>
          <Text c="dimmed">Consulta por customerWorksiteId.</Text>
          <Group mt="md" align="flex-end" justify="space-between" wrap="wrap">
            <TextInput
              label="Customer Worksite ID"
              value={customerWorksiteId}
              onChange={(event) => setCustomerWorksiteId(event.target.value)}
              placeholder="UUID"
            />
            <Button onClick={handleFetch} disabled={!customerWorksiteId} loading={loading}>
              Consultar
            </Button>
          </Group>
          {error && (
            <Text c="red" mt="sm">
              {error}
            </Text>
          )}
        </Paper>

        {data && (
          <>
            <div style={{ marginTop: 24 }}>
              <InventoryDisplay bulk={data.bulk} serial={data.serial} />
            </div>
            <RawJsonPanel data={data} />
          </>
        )}
      </Container>
    </main>
  );
}
