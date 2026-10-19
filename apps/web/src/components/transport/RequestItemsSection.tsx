'use client';
import {
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Text,
  Title,
} from '@mantine/core';
import type { Dispatch, JSX, ReactNode, SetStateAction } from 'react';
import RequestSelectedItems from './RequestSelectedItems';
import {
  Customer,
  Employee,
  GenerateStep,
  SelectedItem,
  SkuOption,
  Warehouse,
} from './request-types';
import { IconPlus } from '@tabler/icons-react';

type Props = {
  onAddItems: () => void;
  renderConfiguration?: (item: SelectedItem) => ReactNode;
  accessorySelector?: ReactNode;
  sourceMode: 'warehouse' | 'on-site';
  setGenerateStep: Dispatch<SetStateAction<GenerateStep>>;
  renderGenerateError: () => JSX.Element | null;
  selectedCustomer: Customer | null;
  selectedWorksiteLabel: string;
  docDate: string;
  docTime: string;
  docType: 'REMISSION' | 'RETURN';
  deliveryMode: 'WAREHOUSE' | 'ON_SITE';
  selectedDriver: Employee | null;
  selectedDispatcher: Employee | null;
  warehouses: Warehouse[];
  loadingInventory: boolean;
  selectedItems: SelectedItem[];
  isTabletOrMobile: boolean;
  renderDamageFields: (item: SelectedItem, index: number) => JSX.Element | null;
  renderAdminItemFields: (
    item: SelectedItem,
    index: number,
  ) => JSX.Element | null;
  updateSelected: (index: number, updates: Partial<SelectedItem>) => void;
  canResolveInline: boolean;
  skuOptions: SkuOption[];
  resolveFreeItemToSku: (index: number, skuId: string | null) => void;
  removeSelected: (selectionId: string) => void;
  goToSignStep: () => Promise<void>;
  checkingProviderRemissions: boolean;
};

export default function RequestItemsSection({
  onAddItems,
  renderConfiguration,
  accessorySelector,
  sourceMode,
  setGenerateStep,
  renderGenerateError,
  selectedCustomer,
  selectedWorksiteLabel,
  docDate,
  docTime,
  docType,
  deliveryMode,
  selectedDriver,
  selectedDispatcher,
  warehouses,
  loadingInventory,
  selectedItems,
  isTabletOrMobile,
  renderDamageFields,
  renderAdminItemFields,
  updateSelected,
  canResolveInline,
  skuOptions,
  resolveFreeItemToSku,
  removeSelected,
  goToSignStep,
  checkingProviderRemissions,
}: Props) {
  return (
    <Paper
      shadow="sm"
      p={{ base: 'md', md: 'xl' }}
      radius="xl"
      withBorder
      mt="lg"
    >
      <Group justify="space-between" align="center" mb="sm">
        <div>
          <Group gap="xs" mb={4}>
            <Badge color="teal" variant="light">
              Paso 2
            </Badge>
            <Badge
              color={sourceMode === 'warehouse' ? 'blue' : 'orange'}
              variant="light"
            >
              {sourceMode === 'warehouse' ? 'Desde bodega' : 'Desde obra'}
            </Badge>
          </Group>
          <Title order={4}>Ítems del documento</Title>
          <Text size="sm" c="dimmed">
            Agrega equipos, cantidades y condiciones para construir el
            documento.
          </Text>
        </div>
        <Button
          variant="light"
          color="gray"
          onClick={() => setGenerateStep('info')}
        >
          Volver a info
        </Button>
      </Group>
      {renderGenerateError()}
      <Paper withBorder radius="lg" p="md" bg="teal.0" mb="md">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
          <div>
            <Text size="xs" fw={800} c="dimmed" tt="uppercase">
              Cliente
            </Text>
            <Text size="sm" fw={700}>
              {selectedCustomer?.name ?? '-'}
            </Text>
          </div>
          <div>
            <Text size="xs" fw={800} c="dimmed" tt="uppercase">
              Obra
            </Text>
            <Text size="sm" fw={700}>
              {selectedWorksiteLabel}
            </Text>
          </div>
          <div>
            <Text size="xs" fw={800} c="dimmed" tt="uppercase">
              Fecha y hora
            </Text>
            <Text size="sm" fw={700}>
              {docDate ? `${docDate} ${docTime}` : '-'}
            </Text>
          </div>
          <div>
            <Text size="xs" fw={800} c="dimmed" tt="uppercase">
              {docType === 'REMISSION' ? 'Entrega' : 'Devolución'}
            </Text>
            <Text size="sm" fw={700}>
              {docType === 'REMISSION'
                ? deliveryMode === 'ON_SITE'
                  ? `En obra (${selectedDriver?.name ?? '-'})`
                  : `Bodega (${selectedDispatcher?.name ?? '-'})`
                : deliveryMode === 'ON_SITE'
                  ? `Recogida en obra (${selectedDriver?.name ?? '-'})`
                  : `Cliente entrega en bodega (${selectedDriver?.name ?? '-'})`}
            </Text>
          </div>
        </SimpleGrid>
      </Paper>
      <Divider my="md" />
      <Group justify="space-between" align="center" wrap="wrap">
        <Title order={4}>Ítems agregados</Title>
        <Button leftSection={<IconPlus size={18} aria-hidden />} onClick={onAddItems} loading={loadingInventory}>
          {selectedItems.length ? 'Agregar más ítems' : 'Agregar ítems'}
        </Button>
      </Group>
      {accessorySelector}
      <RequestSelectedItems selectedItems={selectedItems} isTabletOrMobile={isTabletOrMobile}
        docType={docType} warehouses={warehouses} renderDamageFields={renderDamageFields}
        renderAdminItemFields={renderAdminItemFields} renderConfiguration={renderConfiguration}
        updateSelected={updateSelected} canResolveInline={canResolveInline} skuOptions={skuOptions}
        resolveFreeItemToSku={resolveFreeItemToSku} removeSelected={removeSelected} />

      <Group mt="md" justify="space-between" className="mobile-actions">
        <Button
          variant="light"
          color="gray"
          onClick={() => setGenerateStep('info')}
        >
          Volver a info
        </Button>
        <Button
          onClick={() => void goToSignStep()}
          loading={checkingProviderRemissions}
        >
          Siguiente: Firma
        </Button>
      </Group>
    </Paper>
  );
}
