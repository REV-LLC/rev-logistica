'use client';

import { useState } from 'react';
import { Badge, Button, Container, Group, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import InventoryItemPickerModal, {
  type InventoryItemPickerBulkItem,
  type InventoryItemPickerSerialItem,
} from '@/components/InventoryItemPickerModal';

const bulkItems: InventoryItemPickerBulkItem[] = [
  {
    skuId: 'nave-150',
    skuName: 'NAVE (1.50M)',
    ownerWarehouseId: 'principal',
    ownerWarehouseName: 'Renta Equipos del Valle S.A.S | REV',
    quantity: 84,
  },
  {
    skuId: 'cruceta-200',
    skuName: 'CRUCETA (2.00M)',
    ownerWarehouseId: 'principal',
    ownerWarehouseName: 'Renta Equipos del Valle S.A.S | REV',
    quantity: 126,
  },
  {
    skuId: 'tablero-120',
    skuName: 'TABLERO METÁLICO (1.20M)',
    ownerWarehouseId: 'principal',
    ownerWarehouseName: 'Renta Equipos del Valle S.A.S | REV',
    quantity: 38,
  },
];

const serialItems: InventoryItemPickerSerialItem[] = [
  {
    assetId: 'demoledor-01',
    skuId: 'demoledor',
    skuName: 'DEMOLEDOR 30 KG',
    serialOrEngine: 'REV-D30-001',
    internalNumber: 301,
    ownerWarehouseId: 'principal',
    ownerWarehouseName: 'Renta Equipos del Valle S.A.S | REV',
    quantity: 1,
  },
  {
    assetId: 'vibrador-01',
    skuId: 'vibrador',
    skuName: 'VIBRADOR DE CONCRETO',
    serialOrEngine: 'REV-VIB-014',
    internalNumber: 114,
    ownerWarehouseId: 'principal',
    ownerWarehouseName: 'Renta Equipos del Valle S.A.S | REV',
    quantity: 1,
  },
];

const skuOptions = [
  { id: 'nave-150', name: 'NAVE (1.50M)', category: 'ANDAMIO CONVENCIONAL' },
  { id: 'cruceta-200', name: 'CRUCETA (2.00M)', category: 'ANDAMIO CONVENCIONAL' },
  { id: 'tablero-120', name: 'TABLERO METÁLICO (1.20M)', category: 'ANDAMIO CONVENCIONAL' },
  { id: 'demoledor', name: 'DEMOLEDOR 30 KG', category: 'DEMOLEDORES' },
  { id: 'vibrador', name: 'VIBRADOR DE CONCRETO', category: 'CONCRETOS' },
];

export default function ItemPickerComponentLabPage() {
  const [opened, setOpened] = useState(true);
  const [role, setRole] = useState<'ADMIN' | 'DRIVER'>('ADMIN');
  const [sourceMode, setSourceMode] = useState<'warehouse' | 'on-site'>('warehouse');
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <main>
      <Container size="md" py="xl">
        <Paper withBorder radius="xl" p={{ base: 'md', sm: 'xl' }}>
          <Stack gap="lg">
            <div>
              <Badge variant="light" color="teal" mb="xs">
                Component lab
              </Badge>
              <Title order={2}>Selector de items</Title>
              <Text c="dimmed" mt={6}>
                Esta página usa datos de demostración y no requiere autenticación.
              </Text>
            </div>

            <Group align="flex-end" wrap="wrap">
              <div>
                <Text size="sm" fw={700} mb={6}>
                  Rol
                </Text>
                <SegmentedControl
                  value={role}
                  onChange={(value) => setRole(value as 'ADMIN' | 'DRIVER')}
                  data={['ADMIN', 'DRIVER']}
                />
              </div>
              <div>
                <Text size="sm" fw={700} mb={6}>
                  Origen
                </Text>
                <SegmentedControl
                  value={sourceMode}
                  onChange={(value) => setSourceMode(value as 'warehouse' | 'on-site')}
                  data={[
                    { value: 'warehouse', label: 'Bodega' },
                    { value: 'on-site', label: 'Obra' },
                  ]}
                />
              </div>
            </Group>

            <Button onClick={() => setOpened(true)} w="fit-content">
              Abrir selector
            </Button>
          </Stack>
        </Paper>
      </Container>

      <InventoryItemPickerModal
        opened={opened}
        onClose={() => setOpened(false)}
        bulkItems={bulkItems}
        serialItems={serialItems}
        selectedBulkKeys={new Set()}
        selectedSerialIds={new Set()}
        onAddBulk={() => true}
        onAddSerial={() => true}
        skuOptions={skuOptions}
        itemsAddedNotice={notice}
        onItemAddedNotice={setNotice}
        isDriverRole={role === 'DRIVER'}
        sourceMode={sourceMode}
      />
    </main>
  );
}
