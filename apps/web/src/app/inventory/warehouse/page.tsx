'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import InventoryDisplay from '@/components/InventoryDisplay';
import { useRouter } from 'next/navigation';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Container,
  FileButton,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { IconEdit, IconPhoto, IconPlus, IconUpload } from '@tabler/icons-react';
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
    logoUrl?: string | null;
  } | null;
};

type Owner = {
  id: string;
  name: string;
  active: boolean;
  logoUrl?: string | null;
  logoKey?: string | null;
};

const MAX_OWNER_LOGO_SIZE_BYTES = 1 * 1024 * 1024;
const OWNER_LOGO_MIME_TYPES = new Set(['image/png', 'image/webp', 'image/jpeg']);

export default function WarehouseInventoryPage() {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
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
  const [ownerLogoUploadingId, setOwnerLogoUploadingId] = useState<string | null>(null);
  const [ownerLogoError, setOwnerLogoError] = useState<string | null>(null);
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

  const ownerById = useMemo(() => {
    return new Map(owners.map((owner) => [owner.id, owner]));
  }, [owners]);

  const typeOptions = [
    { value: 'OWN', label: 'Owned' },
    { value: 'ALLY', label: 'Partner' },
  ];

  const activeOptions = [
    { value: 'true', label: 'Activa' },
    { value: 'false', label: 'Inactiva' },
  ];

  const handleFetch = async (targetWarehouseId?: string | null) => {
    const warehouseToFetch = targetWarehouseId ?? warehouseId;
    if (!warehouseToFetch) return;
    setLoading(true);
    setError(null);
    setUnauthorized(false);

    try {
      const response = await api<InventoryResponse>(
        `/inventory/warehouse/${warehouseToFetch}`,
        { method: 'GET' }
      );
      setData(response);
      if (response.bulk.length === 0 && response.serial.length === 0) {
        const selectedWarehouseName =
          warehouses.find((warehouse) => warehouse.id === warehouseToFetch)?.name ?? 'esta bodega';
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

  const handleWarehouseCardClick = async (targetWarehouseId: string) => {
    setWarehouseId(targetWarehouseId);
    await handleFetch(targetWarehouseId);
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
        setOwnersError('Error loading owner companies.');
      }
    } finally {
      setOwnersLoading(false);
    }
  };

  const handleOwnerLogoUpload = async (ownerId: string, file: File | null) => {
    if (!file) return;
    if (!OWNER_LOGO_MIME_TYPES.has(file.type)) {
      setOwnerLogoError('The logo must be PNG, WEBP, or JPEG. SVG is not allowed for now.');
      return;
    }
    if (file.size > MAX_OWNER_LOGO_SIZE_BYTES) {
      setOwnerLogoError('The logo must be 1 MB maximum.');
      return;
    }

    setOwnerLogoUploadingId(ownerId);
    setOwnerLogoError(null);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      await api<Owner>(`/owners/${ownerId}/logo`, {
        method: 'POST',
        body: formData,
      });
      await Promise.all([loadOwners(), loadWarehouses()]);
      if (warehouseId) {
        await handleFetch(warehouseId);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setOwnerLogoError(`Error ${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setOwnerLogoError(err.message);
      } else {
        setOwnerLogoError('Unexpected error uploading the logo.');
      }
    } finally {
      setOwnerLogoUploadingId(null);
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
    setOwnerLogoError(null);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!createOwnerCompanyId) {
      setCreateError('Select an owner company.');
      return;
    }
    if (!createName.trim()) {
      setCreateError('Name is required.');
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
    } catch (err) {
      if (err instanceof ApiError) {
        setCreateError(`Error ${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setCreateError(err.message);
      } else {
        setCreateError('Unexpected error.');
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
    setOwnerLogoError(null);
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    if (!editOwnerCompanyId) {
      setEditError('Select an owner company.');
      return;
    }
    if (!editName.trim()) {
      setEditError('Name is required.');
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
    } catch (err) {
      if (err instanceof ApiError) {
        setEditError(`Error ${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setEditError(err.message);
      } else {
        setEditError('Unexpected error.');
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await api(`/warehouses/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteOpen(false);
      await loadWarehouses();
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
        throw new Error('Invalid server response.');
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
        setAdjustResult('No changes to apply.');
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

  const warehouseCards = useMemo(
    () =>
      warehouses.map((warehouse) => {
        const ownerName = warehouse.ownerCompany?.name ?? 'No owner company';
        const ownerLogoUrl =
          warehouse.ownerCompany?.logoUrl ?? ownerById.get(warehouse.ownerCompanyId)?.logoUrl ?? null;
        const initials = warehouse.name
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((chunk) => chunk[0]?.toUpperCase() ?? '')
          .join('');

        return {
          ...warehouse,
          ownerName,
          ownerLogoUrl,
          initials,
          isSelected: warehouse.id === warehouseId,
        };
      }),
    [ownerById, warehouses, warehouseId],
  );

  const createOwner = createOwnerCompanyId ? ownerById.get(createOwnerCompanyId) ?? null : null;
  const editOwner = editOwnerCompanyId ? ownerById.get(editOwnerCompanyId) ?? null : null;

  const renderOwnerLogoUpload = (ownerId: string | null, owner?: Owner | null) => {
    if (!ownerId) {
      return null;
    }
    const ownerName = owner?.name ?? 'selected company';

    return (
      <Paper withBorder radius="md" p="sm">
        <Stack gap="sm">
          <Group justify="space-between" align="center" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <Box
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 10,
                  border: '1px solid rgba(15, 23, 42, 0.10)',
                  background: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                {owner?.logoUrl ? (
                  <Box
                    component="img"
                    src={owner.logoUrl}
                    alt={`${ownerName} logo`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      padding: 6,
                    }}
                  />
                ) : (
                  <IconPhoto size={22} color="var(--mantine-color-gray-5)" />
                )}
              </Box>
              <div style={{ minWidth: 0 }}>
                <Text fw={700} truncate>
                  {ownerName} logo
                </Text>
                <Text size="sm" c="dimmed">
                  PNG, WEBP, or JPEG. Max 1 MB.
                </Text>
              </div>
            </Group>
            <FileButton
              onChange={(file) => handleOwnerLogoUpload(ownerId, file)}
              accept="image/png,image/jpeg,image/webp"
            >
              {(props) => (
                <Button
                  {...props}
                  size="xs"
                  variant="light"
                  leftSection={<IconUpload size={14} />}
                  loading={ownerLogoUploadingId === ownerId}
                >
                  {owner?.logoUrl ? 'Change' : 'Upload'}
                </Button>
              )}
            </FileButton>
          </Group>
          {ownerLogoError ? (
            <Alert color="red" variant="light" title="Could not upload the logo">
              {ownerLogoError}
            </Alert>
          ) : null}
        </Stack>
      </Paper>
    );
  };

  return (
    <main>
      <Container size="xl" py="xl">
        <Stack gap="lg">
          {warehousesError ? (
            <Alert color="red" variant="light" title="Could not load warehouses">
              {warehousesError}
            </Alert>
          ) : null}
          {ownersError ? (
            <Alert color="red" variant="light" title="Could not load owner companies">
              {ownersError}
            </Alert>
          ) : null}
          {error ? (
            <Alert color="red" variant="light" title="Could not query inventory">
              {error}
            </Alert>
          ) : null}

          <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
            <Stack gap="md">
              <Group justify="space-between" align="flex-start" wrap="wrap">
                <div>
                  <Text fw={700}>Inventory by warehouse</Text>
                  <Text size="sm" c="dimmed">
                    Tap a warehouse to load its inventory.
                  </Text>
                </div>
                <Button onClick={openCreate} leftSection={<IconPlus size={16} />}>
                  Create warehouse
                </Button>
              </Group>

              <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="lg">
                {warehouseCards.map((warehouse) => (
                  <Paper
                    key={warehouse.id}
                    withBorder
                    radius="xl"
                    p={0}
                    style={{
                      cursor: 'pointer',
                      overflow: 'hidden',
                      borderColor: warehouse.isSelected
                        ? 'var(--mantine-color-orange-5)'
                        : 'rgba(15, 23, 42, 0.08)',
                      boxShadow: warehouse.isSelected
                        ? '0 0 0 1px var(--mantine-color-orange-3)'
                        : undefined,
                    }}
                    onClick={() => handleWarehouseCardClick(warehouse.id)}
                  >
                    <Box
                      style={{
                        minHeight: 152,
                        background:
                          warehouse.type === 'OWN'
                            ? 'linear-gradient(135deg, rgba(249,115,22,0.18) 0%, rgba(255,255,255,0.95) 100%)'
                            : 'linear-gradient(135deg, rgba(14,165,233,0.18) 0%, rgba(255,255,255,0.95) 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
                      }}
                    >
                      <Stack align="center" gap={6}>
                        {warehouse.ownerLogoUrl ? (
                          <Box
                            style={{
                              width: 78,
                              height: 78,
                              borderRadius: 14,
                              border: '1px solid rgba(15, 23, 42, 0.10)',
                              background: 'white',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                            }}
                          >
                            <Box
                              component="img"
                              src={warehouse.ownerLogoUrl}
                              alt={`${warehouse.ownerName} logo`}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                                padding: 8,
                              }}
                            />
                          </Box>
                        ) : (
                          <ThemeIcon
                            size={58}
                            radius="xl"
                            variant="white"
                            color={warehouse.type === 'OWN' ? 'orange' : 'blue'}
                          >
                            <Text fw={800} size="lg">
                              {warehouse.initials || 'BG'}
                            </Text>
                          </ThemeIcon>
                        )}
                        <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                          {warehouse.type === 'OWN' ? 'Owned warehouse' : 'Partner warehouse'}
                        </Text>
                      </Stack>
                    </Box>

                    <Stack gap="sm" p="md">
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <div>
                          <Text fw={700}>{warehouse.name}</Text>
                          <Text size="sm" c="dimmed" mt={4}>
                            {warehouse.ownerName}
                          </Text>
                        </div>
                        <Group gap="xs" align="flex-start" wrap="nowrap">
                          <Badge color={warehouse.active ? 'green' : 'gray'} variant="light">
                            {warehouse.active ? 'Active' : 'Inactive'}
                          </Badge>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            radius="xl"
                            aria-label={`Edit ${warehouse.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openEdit(warehouse);
                            }}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                        </Group>
                      </Group>

                      <Group justify="space-between" align="center" wrap="nowrap">
                        <Badge color={warehouse.type === 'OWN' ? 'orange' : 'blue'} variant="light">
                          {warehouse.type === 'OWN' ? 'Owned' : 'Partner'}
                        </Badge>
                        {warehouse.isSelected ? (
                          <Badge color="orange" variant="filled">
                            Loaded
                          </Badge>
                        ) : (
                          <Text size="sm" c="dimmed">
                            Tap to load
                          </Text>
                        )}
                      </Group>
                    </Stack>
                  </Paper>
                ))}
              </SimpleGrid>

            </Stack>
          </Paper>

          {data ? (
            <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
              <Stack gap="md">
                <div>
                  <Text fw={700}>Inventory result</Text>
                  <Text size="sm" c="dimmed">
                    Bulk stock and unique equipment from the selected warehouse.
                  </Text>
                </div>
                <InventoryDisplay
                  bulk={data.bulk}
                  serial={data.serial}
                  onAdjust={openAdjust}
                />
              </Stack>
            </Paper>
          ) : null}
        </Stack>
      </Container>

      <Modal
        opened={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Bulk Stock Adjustment"
        size="lg"
      >
        {!adjustReady ? (
          <div>
            <Text c="dimmed" mb="sm">
              Confirm your admin credentials to continue.
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
                Confirm
              </Button>
            </Group>
          </div>
        ) : (
          <div>
            <Text c="dimmed" mb="sm">
              Enter the desired final quantity by SKU (0 removes it from bulk stock).
            </Text>
            <TextInput
              label="Search SKU"
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
                    <Table.Th>Current</Table.Th>
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
                Apply adjustments
              </Button>
            </Group>
          </div>
        )}
      </Modal>

      <Modal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create warehouse"
        size="lg"
      >
        <Stack gap="md">
          <Paper
            withBorder
            radius="lg"
            p="md"
            style={{
              background:
                'linear-gradient(135deg, rgba(249,115,22,0.10) 0%, rgba(255,255,255,0.98) 100%)',
              borderColor: 'rgba(15, 23, 42, 0.08)',
            }}
          >
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <div>
                <Text fw={700}>New operational warehouse</Text>
                <Text size="sm" c="dimmed" mt={4}>
                  Define name, type, owner, and initial status to make it ready in the system.
                </Text>
              </div>
              <Badge color={createType === 'OWN' ? 'orange' : 'blue'} variant="light">
                {createType === 'OWN' ? 'Owned' : 'Partner'}
              </Badge>
            </Group>
          </Paper>

          <Paper withBorder radius="lg" p="md">
            <Stack gap="md">
              <div>
                <Text fw={700}>Warehouse identity</Text>
                <Text size="sm" c="dimmed">
                  Use a clear name and assign it to the correct owner from the start.
                </Text>
              </div>

              <TextInput
                label="Name"
                placeholder="Example: North main warehouse"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
              />

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <Select
                  label="Type"
                  data={typeOptions}
                  value={createType}
                  onChange={(value) => setCreateType((value as 'OWN' | 'ALLY') ?? 'OWN')}
                />
                <Select
                  label="Status"
                  data={activeOptions}
                  value={String(createActive)}
                  onChange={(value) => setCreateActive(value === 'true')}
                />
              </SimpleGrid>

              <Select
                label="Owner company"
                placeholder={ownersLoading ? 'Loading owners...' : 'Select an owner'}
                data={ownerOptions}
                value={createOwnerCompanyId}
                onChange={(value) => {
                  setOwnerLogoError(null);
                  setCreateOwnerCompanyId(value);
                }}
                disabled={ownersLoading && ownerOptions.length === 0}
                searchable
              />

              {renderOwnerLogoUpload(createOwnerCompanyId, createOwner)}
            </Stack>
          </Paper>

          {createError ? (
            <Alert color="red" variant="light" title="Could not create warehouse">
              {createError}
            </Alert>
          ) : null}

          <Group justify="space-between" className="mobile-actions">
            <Button variant="default" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              loading={createLoading}
              disabled={!createOwnerCompanyId}
            >
              Create warehouse
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit warehouse"
        size="lg"
      >
        <TextInput
          label="Name"
          value={editName}
          onChange={(event) => setEditName(event.target.value)}
        />
        <Select
          label="Type"
          data={typeOptions}
          value={editType}
          onChange={(value) => setEditType((value as 'OWN' | 'ALLY') ?? 'OWN')}
          mt="sm"
        />
        <Select
          label="Owner company"
          placeholder={ownersLoading ? 'Loading owners...' : 'Select an owner'}
          data={ownerOptions}
          value={editOwnerCompanyId}
          onChange={(value) => {
            setOwnerLogoError(null);
            setEditOwnerCompanyId(value);
          }}
          mt="sm"
          disabled={ownersLoading && ownerOptions.length === 0}
          searchable
        />
        <Box mt="sm">{renderOwnerLogoUpload(editOwnerCompanyId, editOwner)}</Box>
        <Select
          label="Status"
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
            Delete
          </Button>
          <Button
            onClick={handleEdit}
            loading={editLoading}
            disabled={!editOwnerCompanyId}
          >
            Save
          </Button>
        </Group>
      </Modal>

      <Modal
        opened={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete warehouse"
      >
        <Text>
          {deleteTarget
            ? `Are you sure you want to delete warehouse "${deleteTarget.name}"?`
            : 'Are you sure you want to delete this warehouse?'}
        </Text>
        {deleteError && (
          <Text c="red" mt="sm">
            {deleteError}
          </Text>
        )}
        <Group mt="md">
          <Button variant="default" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button color="red" onClick={handleDelete} loading={deleteLoading}>
            Delete
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
          <strong>{emptyInventoryWarehouseName.toUpperCase()}</strong> is cleaner than a brand-new
          fridge: there is nothing to show yet.
        </Text>
        <Group mt="md" justify="flex-end">
          <Button onClick={() => setEmptyInventoryOpen(false)}>Got it</Button>
        </Group>
      </Modal>
    </main>
  );
}
