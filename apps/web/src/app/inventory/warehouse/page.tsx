'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import InventoryDisplay from '@/components/InventoryDisplay';
import WarehouseSelect from '@/components/WarehouseSelect';
import { useRouter } from 'next/navigation';
import {
  ActionIcon,
  Button,
  Container,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Table,
  Text,
  TextInput,
  Title
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconEye } from '@tabler/icons-react';
import { setToken } from '@/lib/auth';

interface InventoryResponse {
  warehouseId: string;
  bulk: {
    skuId: string;
    ownerWarehouseId: string;
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

type Warehouse = {
  id: string;
  name: string;
  type: 'OWN' | 'ALLY';
  active: boolean;
  ownerCompanyId: string;
  ownerCompany?: {
    id: string;
    name: string;
  } | null;
};

type Owner = {
  id: string;
  name: string;
  active: boolean;
};

export default function WarehouseInventoryPage() {
  const router = useRouter();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [warehouseSelectKey, setWarehouseSelectKey] = useState(0);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [viewFilter, setViewFilter] = useState<'ALL' | 'BULK' | 'SERIAL'>('ALL');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [reauthEmail, setReauthEmail] = useState('');
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthLoading, setReauthLoading] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [adjustReady, setAdjustReady] = useState(false);
  const [desiredMap, setDesiredMap] = useState<Record<string, number>>({});
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustResult, setAdjustResult] = useState<string | null>(null);
  const [adjustSearch, setAdjustSearch] = useState('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);
  const [warehousesError, setWarehousesError] = useState<string | null>(null);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [ownersError, setOwnersError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState<'OWN' | 'ALLY'>('OWN');
  const [createOwnerCompanyId, setCreateOwnerCompanyId] = useState<string | null>(null);
  const [createActive, setCreateActive] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Warehouse | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<'OWN' | 'ALLY'>('OWN');
  const [editOwnerCompanyId, setEditOwnerCompanyId] = useState<string | null>(null);
  const [editActive, setEditActive] = useState(true);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTarget, setDetailsTarget] = useState<Warehouse | null>(null);
  const [emptyInventoryOpen, setEmptyInventoryOpen] = useState(false);
  const [emptyInventoryWarehouseName, setEmptyInventoryWarehouseName] = useState<string>('');

  const ownerOptions = useMemo(() => {
    const ownersFromWarehouses = new Map<string, string>();
    warehouses.forEach((warehouse) => {
      const owner = warehouse.ownerCompany;
      if (owner?.id && owner?.name) {
        ownersFromWarehouses.set(owner.id, owner.name);
      }
    });

    const optionsFromOwners = owners.map((owner) => ({
      value: owner.id,
      label: owner.active ? owner.name : `${owner.name} (inactivo)`,
    }));

    if (optionsFromOwners.length > 0) {
      return optionsFromOwners;
    }

    return Array.from(ownersFromWarehouses.entries()).map(([id, name]) => ({
      value: id,
      label: name,
    }));
  }, [owners, warehouses]);

  const typeOptions = [
    { value: 'OWN', label: 'Propia' },
    { value: 'ALLY', label: 'Aliada' },
  ];

  const activeOptions = [
    { value: 'true', label: 'Activa' },
    { value: 'false', label: 'Inactiva' },
  ];

  const handleFetch = async () => {
    if (!warehouseId) return;
    setLoading(true);
    setError(null);
    setUnauthorized(false);

    try {
      const response = await api<InventoryResponse>(
        `/inventory/warehouse/${warehouseId}`,
        { method: 'GET' }
      );
      setData(response);
      if (response.bulk.length === 0 && response.serial.length === 0) {
        const selectedWarehouseName =
          warehouses.find((warehouse) => warehouse.id === warehouseId)?.name ?? 'esta bodega';
        setEmptyInventoryWarehouseName(selectedWarehouseName);
        setEmptyInventoryOpen(true);
      }
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

  const bulkAdjustKey = (item: { skuId: string; ownerWarehouseId: string }) =>
    `${item.skuId}::${item.ownerWarehouseId}`;

  const loadWarehouses = async () => {
    setWarehousesLoading(true);
    setWarehousesError(null);
    try {
      const response = await api<Warehouse[]>('/warehouses', { method: 'GET' });
      setWarehouses(response);
    } catch (err) {
      if (err instanceof ApiError) {
        setWarehousesError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setWarehousesError(err.message);
      } else {
        setWarehousesError('Error cargando bodegas.');
      }
    } finally {
      setWarehousesLoading(false);
    }
  };

  const loadOwners = async () => {
    setOwnersLoading(true);
    setOwnersError(null);
    try {
      const response = await api<Owner[]>('/owners', { method: 'GET' });
      setOwners(response);
    } catch (err) {
      if (err instanceof ApiError) {
        setOwnersError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setOwnersError(err.message);
      } else {
        setOwnersError('Error cargando empresas dueñas.');
      }
    } finally {
      setOwnersLoading(false);
    }
  };

  useEffect(() => {
    loadWarehouses();
    loadOwners();
  }, []);

  useEffect(() => {
    if (!createOpen) return;
    if (createOwnerCompanyId) return;
    if (!ownerOptions.length) return;
    setCreateOwnerCompanyId(ownerOptions[0].value);
  }, [createOpen, createOwnerCompanyId, ownerOptions]);

  const openCreate = () => {
    setCreateName('');
    setCreateType('OWN');
    setCreateOwnerCompanyId(ownerOptions[0]?.value ?? null);
    setCreateActive(true);
    setCreateError(null);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!createOwnerCompanyId) {
      setCreateError('Selecciona una empresa dueña.');
      return;
    }
    if (!createName.trim()) {
      setCreateError('El nombre es requerido.');
      return;
    }
    setCreateLoading(true);
    setCreateError(null);
    try {
      await api<Warehouse>('/warehouses', {
        method: 'POST',
        json: {
          name: createName.trim(),
          type: createType,
          ownerCompanyId: createOwnerCompanyId,
          active: createActive,
        },
      });
      setCreateOpen(false);
      await loadWarehouses();
      setWarehouseSelectKey((prev) => prev + 1);
    } catch (err) {
      if (err instanceof ApiError) {
        setCreateError(`Error ${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setCreateError(err.message);
      } else {
        setCreateError('Error inesperado.');
      }
    } finally {
      setCreateLoading(false);
    }
  };

  const openEdit = (warehouse: Warehouse) => {
    setEditTarget(warehouse);
    setEditName(warehouse.name);
    setEditType(warehouse.type);
    setEditOwnerCompanyId(warehouse.ownerCompanyId);
    setEditActive(warehouse.active);
    setEditError(null);
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    if (!editOwnerCompanyId) {
      setEditError('Selecciona una empresa dueña.');
      return;
    }
    if (!editName.trim()) {
      setEditError('El nombre es requerido.');
      return;
    }
    setEditLoading(true);
    setEditError(null);
    try {
      await api<Warehouse>(`/warehouses/${editTarget.id}`, {
        method: 'PATCH',
        json: {
          name: editName.trim(),
          type: editType,
          ownerCompanyId: editOwnerCompanyId,
          active: editActive,
        },
      });
      setEditOpen(false);
      await loadWarehouses();
      setWarehouseSelectKey((prev) => prev + 1);
    } catch (err) {
      if (err instanceof ApiError) {
        setEditError(`Error ${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setEditError(err.message);
      } else {
        setEditError('Error inesperado.');
      }
    } finally {
      setEditLoading(false);
    }
  };

  const openDelete = (warehouse: Warehouse) => {
    setDeleteTarget(warehouse);
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const openDetails = (warehouse: Warehouse) => {
    setDetailsTarget(warehouse);
    setDetailsOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await api(`/warehouses/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteOpen(false);
      await loadWarehouses();
      setWarehouseSelectKey((prev) => prev + 1);
      if (warehouseId === deleteTarget.id) {
        setWarehouseId(null);
        setData(null);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError(`Error ${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setDeleteError(err.message);
      } else {
        setDeleteError('Error inesperado.');
      }
    } finally {
      setDeleteLoading(false);
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

  const openAdjust = () => {
    if (!data) return;
    setAdjustOpen(true);
    setAdjustReady(false);
    setReauthEmail('');
    setReauthPassword('');
    setReauthError(null);
    setAdjustResult(null);
    setAdjustSearch('');
    const initial: Record<string, number> = {};
    data.bulk.forEach((item) => {
      initial[bulkAdjustKey(item)] = item.quantity;
    });
    setDesiredMap(initial);
  };

  const handleReauth = async () => {
    setReauthLoading(true);
    setReauthError(null);
    try {
      const response = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        auth: false,
        redirectOnAuthError: false,
        json: { email: reauthEmail, password: reauthPassword }
      });
      if (!response?.accessToken) {
        throw new Error('Respuesta inválida del servidor.');
      }
      setToken(response.accessToken);
      setAdjustReady(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setReauthError(`Error ${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setReauthError(err.message);
      } else {
        setReauthError('Error inesperado.');
      }
    } finally {
      setReauthLoading(false);
    }
  };

  const handleApplyAdjust = async () => {
    if (!data) return;
    setAdjustLoading(true);
    setAdjustResult(null);
    setError(null);
    try {
      const items = data.bulk
        .map((item) => {
          const desired = desiredMap[bulkAdjustKey(item)];
          const next = typeof desired === 'number' ? desired : item.quantity;
          const diff = next - item.quantity;
          if (diff === 0) return null;
          return { skuId: item.skuId, ownerWarehouseId: item.ownerWarehouseId, quantity: diff };
        })
        .filter(Boolean) as { skuId: string; ownerWarehouseId: string; quantity: number }[];

      if (items.length === 0) {
        setAdjustResult('No hay cambios para aplicar.');
        return;
      }

      const result = await api<{ count: number }>('/inventory/adjust', {
        method: 'POST',
        json: { warehouseId: data.warehouseId, items }
      });
      setAdjustResult(`Ajustes aplicados: ${result.count}`);
      setAdjustOpen(false);
      await handleFetch();
    } catch (err) {
      if (err instanceof ApiError) {
        setAdjustResult(`Error ${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setAdjustResult(err.message);
      } else {
        setAdjustResult('Error inesperado.');
      }
    } finally {
      setAdjustLoading(false);
    }
  };

  const filteredBulk = data
    ? data.bulk.filter((item) => {
        if (!adjustSearch.trim()) return true;
        const query = adjustSearch.trim().toLowerCase();
        return (
          item.skuId.toLowerCase().includes(query) ||
          (item.skuName ?? '').toLowerCase().includes(query)
        );
      })
    : [];

  return (
    <main>
      <Container size="lg" py="xl">
        <Paper shadow="sm" p="xl" radius="md" withBorder>
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <div>
              <Title order={2}>Bodegas</Title>
              <Text c="dimmed">Administra y crea bodegas.</Text>
            </div>
            <Button onClick={openCreate}>Crear bodega</Button>
          </Group>
          {warehousesError && (
            <Text c="red" mt="sm">
              {warehousesError}
            </Text>
          )}
          {ownersError && (
            <Text c="red" mt="sm">
              {ownersError}
            </Text>
          )}
          <ScrollArea mt="md">
            <Table striped highlightOnHover className="table-mobile-fit">
              <Table.Caption>
                {warehousesLoading
                  ? 'Cargando bodegas...'
                  : `${warehouses.length} bodegas`}
              </Table.Caption>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={isMobile ? { width: '80%' } : undefined}>Nombre</Table.Th>
                  {isMobile ? <Table.Th style={{ width: '20%' }}>Ver</Table.Th> : null}
                  {!isMobile ? <Table.Th>Tipo</Table.Th> : null}
                  {!isMobile ? <Table.Th>Empresa dueña</Table.Th> : null}
                  {!isMobile ? <Table.Th>Estado</Table.Th> : null}
                  {!isMobile ? <Table.Th>Acciones</Table.Th> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {warehouses.map((warehouse) => (
                  <Table.Tr key={warehouse.id}>
                    <Table.Td>
                      <Text fw={600}>{warehouse.name}</Text>
                      {!isMobile ? (
                        <Text size="xs" c="dimmed">
                          {warehouse.id}
                        </Text>
                      ) : null}
                    </Table.Td>
                    {isMobile ? (
                      <Table.Td>
                        <ActionIcon
                          variant="light"
                          aria-label={`Ver detalles de ${warehouse.name}`}
                          onClick={() => openDetails(warehouse)}
                        >
                          <IconEye size={16} />
                        </ActionIcon>
                      </Table.Td>
                    ) : null}
                    {!isMobile ? <Table.Td>{warehouse.type === 'OWN' ? 'Propia' : 'Aliada'}</Table.Td> : null}
                    {!isMobile ? (
                      <Table.Td>{warehouse.ownerCompany?.name ?? warehouse.ownerCompanyId}</Table.Td>
                    ) : null}
                    {!isMobile ? <Table.Td>{warehouse.active ? 'Activa' : 'Inactiva'}</Table.Td> : null}
                    {!isMobile ? (
                      <Table.Td>
                        <Group gap="xs">
                          <Button size="xs" variant="light" onClick={() => openEdit(warehouse)}>
                            Editar
                          </Button>
                        </Group>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>

        <Paper shadow="sm" p="xl" radius="md" withBorder mt="md">
          <Title order={2}>Inventario por bodega</Title>
          <Text c="dimmed">Consulta el inventario de una bodega.</Text>
          <Group mt="md" align="flex-end" justify="space-between" wrap="wrap">
            <div style={{ flex: 1, minWidth: 280 }}>
              <WarehouseSelect
                key={warehouseSelectKey}
                value={warehouseId}
                onChange={setWarehouseId}
              />
            </div>
            <Select
              label="Ver"
              value={viewFilter}
              onChange={(value) => setViewFilter((value as typeof viewFilter) ?? 'ALL')}
              data={[
                { value: 'ALL', label: 'Todo' },
                { value: 'BULK', label: 'Stock masivo' },
                { value: 'SERIAL', label: 'Serial' }
              ]}
              w={180}
            />
            <Button onClick={handleFetch} disabled={!warehouseId} loading={loading}>
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
              <InventoryDisplay
                bulk={data.bulk}
                serial={data.serial}
                onAdjust={openAdjust}
                viewFilter={viewFilter}
              />
            </div>
          </>
        )}
      </Container>

      <Modal
        opened={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Adjust de Stock Masivo"
        size="lg"
      >
        {!adjustReady ? (
          <div>
            <Text c="dimmed" mb="sm">
              Confirma tus credenciales de admin para continuar.
            </Text>
            <TextInput
              label="Email"
              type="email"
              value={reauthEmail}
              onChange={(event) => setReauthEmail(event.target.value)}
            />
            <TextInput
              label="Password"
              type="password"
              mt="sm"
              value={reauthPassword}
              onChange={(event) => setReauthPassword(event.target.value)}
            />
            {reauthError && (
              <Text c="red" mt="sm">
                {reauthError}
              </Text>
            )}
            <Group mt="md">
              <Button onClick={handleReauth} loading={reauthLoading}>
                Confirmar
              </Button>
            </Group>
          </div>
        ) : (
          <div>
            <Text c="dimmed" mb="sm">
              Ingresa la cantidad final deseada por SKU (0 para eliminar del stock masivo).
            </Text>
            <TextInput
              label="Buscar SKU"
              placeholder="Nombre o UUID"
              value={adjustSearch}
              onChange={(event) => setAdjustSearch(event.target.value)}
              mb="sm"
            />
            <ScrollArea h={360}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>SKU</Table.Th>
                    <Table.Th>Actual</Table.Th>
                    <Table.Th>Final</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredBulk.map((item) => (
                    <Table.Tr key={item.skuId}>
                      <Table.Td>
                        <Text fw={600}>{item.skuName ?? item.skuId}</Text>
                        <Text size="xs" c="dimmed">
                          {item.skuId}
                        </Text>
                      </Table.Td>
                      <Table.Td>{item.quantity}</Table.Td>
                      <Table.Td>
                        <NumberInput
                          min={0}
                          value={desiredMap[bulkAdjustKey(item)]}
                          onChange={(value) =>
                            setDesiredMap((prev) => ({
                              ...prev,
                              [bulkAdjustKey(item)]: typeof value === 'number' ? value : item.quantity
                            }))
                          }
                        />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
            {adjustResult && (
              <Text c={adjustResult.startsWith('Error') ? 'red' : 'green'} mt="sm">
                {adjustResult}
              </Text>
            )}
            <Group mt="md">
              <Button onClick={handleApplyAdjust} loading={adjustLoading}>
                Aplicar ajustes
              </Button>
            </Group>
          </div>
        )}
      </Modal>

      <Modal
        opened={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title="Detalle de bodega"
      >
        {detailsTarget ? (
          <>
            <Text fw={700}>{detailsTarget.name}</Text>
            <Text size="xs" c="dimmed" mb="md">
              {detailsTarget.id}
            </Text>
            <Text>
              <strong>Tipo:</strong> {detailsTarget.type === 'OWN' ? 'Propia' : 'Aliada'}
            </Text>
            <Text mt="xs">
              <strong>Empresa dueña:</strong>{' '}
              {detailsTarget.ownerCompany?.name ?? detailsTarget.ownerCompanyId}
            </Text>
            <Text mt="xs">
              <strong>Estado:</strong> {detailsTarget.active ? 'Activa' : 'Inactiva'}
            </Text>
            <Group mt="md" className="mobile-actions">
              <Button
                variant="light"
                onClick={() => {
                  setDetailsOpen(false);
                  openEdit(detailsTarget);
                }}
              >
                Editar
              </Button>
            </Group>
          </>
        ) : null}
      </Modal>

      <Modal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Crear bodega"
      >
        <TextInput
          label="Nombre"
          value={createName}
          onChange={(event) => setCreateName(event.target.value)}
        />
        <Select
          label="Tipo"
          data={typeOptions}
          value={createType}
          onChange={(value) => setCreateType((value as 'OWN' | 'ALLY') ?? 'OWN')}
          mt="sm"
        />
        <Select
          label="Empresa dueña"
          placeholder={ownersLoading ? 'Cargando dueños...' : 'Selecciona un dueño'}
          data={ownerOptions}
          value={createOwnerCompanyId}
          onChange={(value) => setCreateOwnerCompanyId(value)}
          mt="sm"
          disabled={ownersLoading && ownerOptions.length === 0}
          searchable
        />
        <Select
          label="Estado"
          data={activeOptions}
          value={String(createActive)}
          onChange={(value) => setCreateActive(value === 'true')}
          mt="sm"
        />
        {createError && (
          <Text c="red" mt="sm">
            {createError}
          </Text>
        )}
        <Group mt="md">
          <Button
            onClick={handleCreate}
            loading={createLoading}
            disabled={!createOwnerCompanyId}
          >
            Crear
          </Button>
        </Group>
      </Modal>

      <Modal
        opened={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar bodega"
      >
        <TextInput
          label="Nombre"
          value={editName}
          onChange={(event) => setEditName(event.target.value)}
        />
        <Select
          label="Tipo"
          data={typeOptions}
          value={editType}
          onChange={(value) => setEditType((value as 'OWN' | 'ALLY') ?? 'OWN')}
          mt="sm"
        />
        <Select
          label="Empresa dueña"
          placeholder={ownersLoading ? 'Cargando dueños...' : 'Selecciona un dueño'}
          data={ownerOptions}
          value={editOwnerCompanyId}
          onChange={(value) => setEditOwnerCompanyId(value)}
          mt="sm"
          disabled={ownersLoading && ownerOptions.length === 0}
          searchable
        />
        <Select
          label="Estado"
          data={activeOptions}
          value={String(editActive)}
          onChange={(value) => setEditActive(value === 'true')}
          mt="sm"
        />
        {editError && (
          <Text c="red" mt="sm">
            {editError}
          </Text>
        )}
        <Group mt="md" justify="space-between">
          <Button
            color="red"
            variant="light"
            onClick={() => {
              if (!editTarget) return;
              setEditOpen(false);
              openDelete(editTarget);
            }}
          >
            Eliminar
          </Button>
          <Button
            onClick={handleEdit}
            loading={editLoading}
            disabled={!editOwnerCompanyId}
          >
            Guardar
          </Button>
        </Group>
      </Modal>

      <Modal
        opened={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Eliminar bodega"
      >
        <Text>
          {deleteTarget
            ? `¿Seguro que deseas eliminar la bodega "${deleteTarget.name}"?`
            : '¿Seguro que deseas eliminar esta bodega?'}
        </Text>
        {deleteError && (
          <Text c="red" mt="sm">
            {deleteError}
          </Text>
        )}
        <Group mt="md">
          <Button variant="default" onClick={() => setDeleteOpen(false)}>
            Cancelar
          </Button>
          <Button color="red" onClick={handleDelete} loading={deleteLoading}>
            Eliminar
          </Button>
        </Group>
      </Modal>

      <Modal
        opened={emptyInventoryOpen}
        onClose={() => setEmptyInventoryOpen(false)}
      >
        <Text ta="center" size="xl" mb="xs">
          ¯\_(ツ)_/¯
        </Text>
        <Text>
          <strong>{emptyInventoryWarehouseName.toUpperCase()}</strong> está más limpia que una
          nevera nueva: no hay nada que mostrar todavía.
        </Text>
        <Group mt="md" justify="flex-end">
          <Button onClick={() => setEmptyInventoryOpen(false)}>Entendido</Button>
        </Group>
      </Modal>
    </main>
  );
}
