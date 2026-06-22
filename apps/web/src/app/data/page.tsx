'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Container,
  FileInput,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconDatabaseExport,
  IconDownload,
  IconFileSpreadsheet,
  IconUpload,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import StatCard from '@/components/dashboard/StatCard';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';

type BackupTable = {
  key: string;
  label: string;
};

type ImportResult = {
  ok: boolean;
  mode: string;
  tables: Record<string, { received: number; upserted: number }>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

async function downloadFile(path: string, fallbackName: string) {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, { headers });
  if (!response.ok) {
    throw new Error((await response.text()) || 'Could not download the file');
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  const fileName = match?.[1] ?? fallbackName;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function DataPage() {
  const [tables, setTables] = useState<BackupTable[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<BackupTable[]>('/backups/tables')
      .then((items) => {
        setTables(items);
        setSelectedTable(items[0]?.key ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load tables'));
  }, []);

  const tableOptions = useMemo(
    () => tables.map((table) => ({ value: table.key, label: table.label })),
    [tables],
  );

  const importRows = useMemo(() => {
    if (!result) return [];
    return Object.entries(result.tables).filter(([, value]) => value.received > 0);
  }, [result]);

  const handleDownloadJson = async () => {
    setError(null);
    setLoading(true);
    try {
      await downloadFile('/backups/export/json', 'rev-logistica-backup.json');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the backup');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCsv = async () => {
    if (!selectedTable) return;
    setError(null);
    setLoading(true);
    try {
      await downloadFile(`/backups/export/csv/${selectedTable}`, `${selectedTable}.csv`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the CSV');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!backupFile) return;
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const parsed = JSON.parse(await backupFile.text());
      const response = await api<ImportResult>('/backups/import/json', {
        method: 'POST',
        json: parsed,
      });
      setResult(response);
      setBackupFile(null);
    } catch (err) {
      const message =
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'Could not upload the backup';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        <PageHeaderCard
          title="Data"
          description="JSON backups and CSV exports"
          icon={<IconDatabaseExport size={20} />}
          iconColor="blue"
          accentColor="rgba(34, 139, 230, 0.14)"
        />

        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
          <StatCard label="Backup format" value="JSON" hint="Upsert restore" icon={<IconDatabaseExport size={20} />} color="blue" />
          <StatCard label="Flat format" value="CSV" hint="One table per file" icon={<IconFileSpreadsheet size={20} />} color="green" />
          <StatCard label="Access" value="Admin" hint="Protected operation" icon={<IconUpload size={20} />} color="red" />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          <Paper withBorder radius="md" p="md">
            <Stack gap="md">
              <Group gap="sm" align="center">
                <ThemeIcon variant="light" color="blue" radius="sm">
                  <IconDownload size={18} />
                </ThemeIcon>
                <div>
                  <Title order={3} size="h4">
                    Full backup
                  </Title>
                  <Text size="sm" c="dimmed">
                    JSON file with every operational table.
                  </Text>
                </div>
              </Group>
              <Button leftSection={<IconDownload size={16} />} onClick={handleDownloadJson} loading={loading}>
                Download JSON backup
              </Button>
            </Stack>
          </Paper>

          <Paper withBorder radius="md" p="md">
            <Stack gap="md">
              <Group gap="sm" align="center">
                <ThemeIcon variant="light" color="green" radius="sm">
                  <IconFileSpreadsheet size={18} />
                </ThemeIcon>
                <div>
                  <Title order={3} size="h4">
                    Export table
                  </Title>
                  <Text size="sm" c="dimmed">
                    Flat CSV for Excel, analysis, or review.
                  </Text>
                </div>
              </Group>
              <Select data={tableOptions} value={selectedTable} onChange={setSelectedTable} searchable />
              <Button
                variant="light"
                color="green"
                leftSection={<IconFileSpreadsheet size={16} />}
                onClick={handleDownloadCsv}
                disabled={!selectedTable}
                loading={loading}
              >
                Download CSV
              </Button>
            </Stack>
          </Paper>
        </SimpleGrid>

        <Paper withBorder radius="md" p="md">
          <Stack gap="md">
            <Group gap="sm" align="center">
              <ThemeIcon variant="light" color="red" radius="sm">
                <IconUpload size={18} />
              </ThemeIcon>
              <div>
                <Title order={3} size="h4">
                  Upload JSON backup
                </Title>
                <Text size="sm" c="dimmed">
                  Create or update records using the file IDs.
                </Text>
              </div>
            </Group>
            <FileInput
              accept="application/json,.json"
              value={backupFile}
              onChange={setBackupFile}
              placeholder="Select .json file"
            />
            <Group justify="flex-end">
              <Button
                color="red"
                leftSection={<IconUpload size={16} />}
                onClick={handleImport}
                disabled={!backupFile}
                loading={loading}
              >
                Upload backup
              </Button>
            </Group>

            {result && (
              <Table.ScrollContainer minWidth={520}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Table</Table.Th>
                      <Table.Th>Received</Table.Th>
                      <Table.Th>Loaded</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {importRows.map(([key, value]) => (
                      <Table.Tr key={key}>
                        <Table.Td>{tables.find((table) => table.key === key)?.label ?? key}</Table.Td>
                        <Table.Td>{value.received}</Table.Td>
                        <Table.Td>{value.upserted}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
