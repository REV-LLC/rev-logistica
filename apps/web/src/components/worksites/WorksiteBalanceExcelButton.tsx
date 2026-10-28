'use client';

import { useState } from 'react';
import { Alert, Button, Stack } from '@mantine/core';
import { IconFileSpreadsheet } from '@tabler/icons-react';
import { exportBalanceReport } from '@/lib/balance-export';

export default function WorksiteBalanceExcelButton({
  customerWorksiteId,
}: {
  customerWorksiteId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await exportBalanceReport({ report: 'worksites', customerWorksiteId });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo exportar el saldo de la obra.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack gap="xs">
      <Button
        variant="light"
        color="green"
        leftSection={<IconFileSpreadsheet size={17} />}
        loading={busy}
        onClick={() => void download()}
      >
        Exportar Excel
      </Button>
      {error ? (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      ) : null}
    </Stack>
  );
}
