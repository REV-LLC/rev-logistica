'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Container,
  FileInput,
  Group,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconBuildingWarehouse,
  IconEye,
  IconMail,
  IconPencil,
  IconPhone,
  IconPlus,
  IconSearch,
  IconUpload,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import StatCard from '@/components/dashboard/StatCard';
import DataTableToolbar from '@/components/tables/DataTableToolbar';
import EntityDataTable from '@/components/tables/EntityDataTable';
import type { DataTableColumn } from '@/components/tables/table.types';
import { api, ApiError } from '@/lib/api';

type Provider = {
  id: string;
  name: string;
  nitOrId: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  category: 'INTERNAL' | 'PROVIDER';
  active: boolean;
  createdAt: string;
};

type Warehouse = {
  id: string;
  name: string;
  type: 'OWN' | 'ALLY';
  active: boolean;
  ownerCompanyId: string;
};

type ProviderForm = {
  name: string;
  nitOrId: string;
  phone: string;
  email: string;
  active: boolean;
};

const emptyForm: ProviderForm = {
  name: '',
  nitOrId: '',
  phone: '',
  email: '',
  active: true,
};

const providerLogoStyles = {
  root: { flexShrink: 0 },
  image: {
    backgroundColor: 'var(--mantine-color-white)',
    objectFit: 'contain' as const,
    padding: 4,
  },
};

const providerLogoImageProps = {
  decoding: 'async' as const,
  loading: 'lazy' as const,
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return `${error.status}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return fallback;
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [formOpen, setFormOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [detailsProvider, setDetailsProvider] = useState<Provider | null>(null);
  const [form, setForm] = useState<ProviderForm>(emptyForm);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ownerData, warehouseData] = await Promise.all([
        api<Provider[]>('/owners'),
        api<Warehouse[]>('/warehouses'),
      ]);
      setProviders(ownerData);
      setWarehouses(warehouseData);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'No se pudieron cargar los proveedores.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const warehousesByProvider = useMemo(() => {
    const map = new Map<string, Warehouse[]>();
    warehouses.forEach((warehouse) => {
      if (warehouse.type !== 'ALLY') return;
      const current = map.get(warehouse.ownerCompanyId) ?? [];
      current.push(warehouse);
      map.set(warehouse.ownerCompanyId, current);
    });
    return map;
  }, [warehouses]);

  const providerDirectory = useMemo(
    () => providers.filter((provider) => provider.category === 'PROVIDER'),
    [providers],
  );

  const filteredProviders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    return providerDirectory.filter((provider) => {
      if (statusFilter === 'ACTIVE' && !provider.active) return false;
      if (statusFilter === 'INACTIVE' && provider.active) return false;
      if (!query) return true;
      return [provider.name, provider.nitOrId, provider.phone, provider.email]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es')
        .includes(query);
    });
  }, [providerDirectory, search, statusFilter]);

  const openCreate = () => {
    setEditingProvider(null);
    setForm(emptyForm);
    setLogoFile(null);
    setError(null);
    setSuccess(null);
    setFormOpen(true);
  };

  const openEdit = (provider: Provider) => {
    setEditingProvider(provider);
    setForm({
      name: provider.name,
      nitOrId: provider.nitOrId ?? '',
      phone: provider.phone ?? '',
      email: provider.email ?? '',
      active: provider.active,
    });
    setLogoFile(null);
    setError(null);
    setSuccess(null);
    setFormOpen(true);
  };

  const saveProvider = async () => {
    if (!form.name.trim()) {
      setError('El nombre del proveedor es obligatorio.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const isEditing = Boolean(editingProvider);
      let saved = await api<Provider>(
        isEditing ? `/owners/${editingProvider?.id}` : '/owners',
        {
          method: isEditing ? 'PATCH' : 'POST',
          json: {
            name: form.name.trim(),
            nitOrId: form.nitOrId.trim() || (isEditing ? null : undefined),
            phone: form.phone.trim() || (isEditing ? null : undefined),
            email: form.email.trim() || (isEditing ? null : undefined),
            active: form.active,
          },
        },
      );

      let logoWarning: string | null = null;
      if (logoFile) {
        const data = new FormData();
        data.append('logo', logoFile);
        try {
          saved = await api<Provider>(`/owners/${saved.id}/logo`, {
            method: 'POST',
            body: data,
          });
        } catch (uploadError) {
          logoWarning = getErrorMessage(uploadError, 'No se pudo cargar el logo.');
        }
      }

      setProviders((current) =>
        [...current.filter((provider) => provider.id !== saved.id), saved]
          .sort((a, b) => a.name.localeCompare(b.name, 'es')),
      );
      setFormOpen(false);
      setEditingProvider(null);
      setLogoFile(null);
      if (detailsProvider?.id === saved.id) setDetailsProvider(saved);
      setSuccess(
        logoWarning
          ? `Proveedor guardado. ${logoWarning}`
          : `Proveedor ${isEditing ? 'actualizado' : 'creado'} correctamente.`,
      );
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'No se pudo guardar el proveedor.'));
    } finally {
      setSaving(false);
    }
  };

  const activeProviders = providerDirectory.filter((provider) => provider.active).length;
  const alliedWarehouses = warehouses.filter((warehouse) => warehouse.type === 'ALLY');
  const providersWithoutWarehouse = providerDirectory.filter(
    (provider) => (warehousesByProvider.get(provider.id)?.length ?? 0) === 0,
  ).length;

  const columns: DataTableColumn<Provider>[] = [
    {
      id: 'provider',
      header: 'Proveedor',
      ariaLabel: 'proveedor',
      width: '38%',
      sortValue: (provider) => provider.name,
      mobile: { priority: 'primary' },
      cell: (provider) => (
        <Group gap="sm" wrap="nowrap">
          <Avatar
            src={provider.logoUrl}
            alt={`Logo de ${provider.name}`}
            name={provider.name}
            color="yellow"
            radius="md"
            size={64}
            imageProps={providerLogoImageProps}
            styles={providerLogoStyles}
          />
          <div style={{ minWidth: 0 }}>
            <Text fw={700} lineClamp={1}>{provider.name}</Text>
            <Text size="xs" c="dimmed">
              {provider.nitOrId ? `NIT: ${provider.nitOrId}` : 'Sin NIT'}
            </Text>
          </div>
        </Group>
      ),
    },
    {
      id: 'contact',
      header: 'Contacto',
      ariaLabel: 'contacto',
      width: '38%',
      sortValue: (provider) => provider.email ?? provider.phone ?? '',
      mobile: { label: 'Contacto', priority: 'detail' },
      cell: (provider) => (
        <Stack gap={4}>
          <Group gap={6} wrap="nowrap">
            <IconPhone size={14} color="var(--mantine-color-dimmed)" aria-hidden="true" />
            <Text size="sm">{provider.phone || 'Sin teléfono'}</Text>
          </Group>
          <Group gap={6} wrap="nowrap" align="flex-start">
            <IconMail size={14} color="var(--mantine-color-dimmed)" aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
            <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
              {provider.email || 'Sin correo'}
            </Text>
          </Group>
        </Stack>
      ),
    },
    {
      id: 'status',
      header: 'Estado',
      ariaLabel: 'estado',
      width: '14%',
      sortValue: (provider) => provider.active ? 1 : 0,
      mobile: { label: 'Estado', priority: 'detail' },
      cell: (provider) => (
        <Badge color={provider.active ? 'green' : 'gray'} variant="light">
          {provider.active ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
  ];

  const detailWarehouses = detailsProvider
    ? warehousesByProvider.get(detailsProvider.id) ?? []
    : [];

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <PageHeaderCard
          title="Proveedores"
          description="Administra los datos de los dueños externos y consulta sus bodegas asociadas."
          icon={<IconBuildingWarehouse size={20} />}
          iconColor="yellow"
          accentColor="rgba(245,158,11,0.12)"
          aside={(
            <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
              Nuevo proveedor
            </Button>
          )}
        >
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <StatCard label="Proveedores" value={String(providerDirectory.length)} hint={`${activeProviders} activos`} color="yellow" icon={<IconBuildingWarehouse size={20} />} />
            <StatCard label="Bodegas" value={String(alliedWarehouses.length)} hint="Bodegas proveedoras" color="blue" icon={<IconBuildingWarehouse size={20} />} />
            <StatCard label="Sin bodega" value={String(providersWithoutWarehouse)} hint="Pendientes por relacionar" color="gray" icon={<IconBuildingWarehouse size={20} />} />
          </SimpleGrid>
        </PageHeaderCard>

        {error ? <Alert color="red">{error}</Alert> : null}
        {success ? <Alert color="green">{success}</Alert> : null}

        <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
          <Stack gap="md">
            <DataTableToolbar
              title="Directorio de proveedores"
              description={`${filteredProviders.length} de ${providerDirectory.length} proveedores.`}
              mb={0}
            />
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput
                aria-label="Buscar proveedores"
                placeholder="Buscar por nombre, NIT, teléfono o correo"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                leftSection={<IconSearch size={16} />}
              />
              <Select
                aria-label="Filtrar proveedores por estado"
                value={statusFilter}
                onChange={(value) => setStatusFilter((value as typeof statusFilter) ?? 'ALL')}
                data={[
                  { value: 'ALL', label: 'Todos los estados' },
                  { value: 'ACTIVE', label: 'Activos' },
                  { value: 'INACTIVE', label: 'Inactivos' },
                ]}
                allowDeselect={false}
              />
            </SimpleGrid>
            <EntityDataTable
              rows={filteredProviders}
              columns={columns}
              getRowId={(provider) => provider.id}
              loading={loading}
              tableMinWidth={760}
              emptyState={{
                title: 'No hay proveedores para mostrar',
                description: 'Ajusta los filtros o crea un nuevo proveedor.',
                icon: <IconBuildingWarehouse size={24} />,
              }}
              actions={(provider) => [
                {
                  key: 'view',
                  label: `Ver ${provider.name}`,
                  icon: <IconEye size={16} />,
                  color: 'blue',
                  onClick: () => setDetailsProvider(provider),
                },
                {
                  key: 'edit',
                  label: `Editar ${provider.name}`,
                  icon: <IconPencil size={16} />,
                  color: 'yellow',
                  onClick: () => openEdit(provider),
                },
              ]}
            />
          </Stack>
        </Paper>
      </Stack>

      <Modal
        opened={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingProvider ? 'Editar proveedor' : 'Nuevo proveedor'}
        centered
        size="lg"
        closeOnClickOutside={!saving}
        closeOnEscape={!saving}
      >
        <Stack gap="md">
          <TextInput
            label="Nombre o razón social"
            value={form.name}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((current) => ({ ...current, name: value }));
            }}
            required
          />
          <TextInput
            label="NIT o identificación"
            value={form.nitOrId}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setForm((current) => ({ ...current, nitOrId: value }));
            }}
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <TextInput
              label="Teléfono"
              value={form.phone}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setForm((current) => ({ ...current, phone: value }));
              }}
              leftSection={<IconPhone size={16} />}
            />
            <TextInput
              label="Correo"
              type="email"
              value={form.email}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setForm((current) => ({ ...current, email: value }));
              }}
              leftSection={<IconMail size={16} />}
            />
          </SimpleGrid>
          <FileInput
            label="Logo"
            description="PNG, JPG o WEBP de máximo 1 MB"
            value={logoFile}
            onChange={setLogoFile}
            accept="image/png,image/jpeg,image/webp"
            leftSection={<IconUpload size={16} />}
            clearable
          />
          <Switch
            label="Proveedor activo"
            checked={form.active}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setForm((current) => ({ ...current, active: checked }));
            }}
          />
          <Group justify="flex-end" className="mobile-actions">
            <Button variant="default" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void saveProvider()} loading={saving} disabled={!form.name.trim()}>
              Guardar proveedor
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={Boolean(detailsProvider)}
        onClose={() => setDetailsProvider(null)}
        title="Detalle del proveedor"
        centered
        size="lg"
      >
        {detailsProvider ? (
          <Stack gap="lg">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Group gap="md" wrap="nowrap">
                <Avatar src={detailsProvider.logoUrl} name={detailsProvider.name} size="lg" radius="md" color="yellow" />
                <div style={{ minWidth: 0 }}>
                  <Text fw={800} size="lg" lineClamp={2}>{detailsProvider.name}</Text>
                  <Text size="sm" c="dimmed">{detailsProvider.nitOrId || 'Sin identificación'}</Text>
                </div>
              </Group>
              <Badge color={detailsProvider.active ? 'green' : 'gray'} variant="light">
                {detailsProvider.active ? 'Activo' : 'Inactivo'}
              </Badge>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <Paper withBorder radius="md" p="sm">
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Teléfono</Text>
                <Text size="sm" mt={6}>{detailsProvider.phone || '-'}</Text>
              </Paper>
              <Paper withBorder radius="md" p="sm">
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Correo</Text>
                <Text size="sm" mt={6} style={{ overflowWrap: 'anywhere' }}>{detailsProvider.email || '-'}</Text>
              </Paper>
            </SimpleGrid>

            <Stack gap="sm">
              <Group justify="space-between">
                <div>
                  <Text fw={800}>Bodegas proveedoras</Text>
                  <Text size="sm" c="dimmed">Bodegas asociadas a este dueño</Text>
                </div>
                <Badge color="blue" variant="light">{detailWarehouses.length}</Badge>
              </Group>
              {detailWarehouses.length ? detailWarehouses.map((warehouse) => (
                <Paper key={warehouse.id} withBorder radius="md" p="sm">
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <div style={{ minWidth: 0 }}>
                      <Text fw={700} size="sm" lineClamp={1}>{warehouse.name}</Text>
                      <Text size="xs" c="dimmed">{warehouse.active ? 'Activa' : 'Inactiva'}</Text>
                    </div>
                    <Button
                      component={Link}
                      href={`/inventory/warehouse/provider/${warehouse.id}`}
                      size="xs"
                      variant="default"
                    >
                      Abrir inventario
                    </Button>
                  </Group>
                </Paper>
              )) : (
                <Paper radius="md" p="md" bg="gray.0">
                  <Text size="sm" c="dimmed" ta="center">Este proveedor todavía no tiene bodegas.</Text>
                </Paper>
              )}
            </Stack>

            <Group justify="flex-end">
              <Button variant="light" leftSection={<IconPencil size={16} />} onClick={() => {
                const provider = detailsProvider;
                setDetailsProvider(null);
                openEdit(provider);
              }}>
                Editar proveedor
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
    </Container>
  );
}
