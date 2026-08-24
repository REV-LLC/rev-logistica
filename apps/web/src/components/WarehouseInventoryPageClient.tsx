'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import InventoryDisplay from '@/components/InventoryDisplay';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Container,
  Drawer,
  FileButton,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconBuildingWarehouse,
  IconChevronRight,
  IconEdit,
  IconFilter,
  IconPhoto,
  IconPlus,
  IconSearch,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import { setToken } from '@/lib/auth';
import OwnerCreateModal, {
  buildOwnerNitOrId,
  emptyOwnerCreateForm,
  validateOwnerCreateForm,
  type OwnerCreateForm,
} from '@/components/OwnerCreateModal';
import TableRowActions from '@/components/TableRowActions';
import classes from '@/components/WarehouseInventoryPageClient.module.css';

interface InventoryResponse {
  warehouseId: string;
  bulk: {
    skuId: string;
    ownerWarehouseId: string;
    skuName: string | null;
    imageUrl: string | null;
    imageFileObjectId: string | null;
    quantity: number;
    worksiteQuantity: number;
    worksiteLocations: Array<{
      customerWorksiteId: string;
      worksiteId: string | null;
      worksiteName: string;
      customerId: string | null;
      customerName: string | null;
      quantity: number;
    }>;
  }[];
  serial: {
    assetId: string;
    skuId?: string | null;
    ownerWarehouseId?: string | null;
    ownerWarehouseName?: string | null;
    serialOrEngine: string | null;
    description: string | null;
    skuName?: string | null;
    brand?: string | null;
    model?: string | null;
    chargeType?: 'DAY' | 'HOUR' | string | null;
    minimumChargeHours?: number | string | null;
    status?: 'IN' | 'OUT' | 'TRANSIT' | string | null;
    location?: {
      type: 'WAREHOUSE' | 'WORKSITE' | 'TRANSIT';
      name: string | null;
    } | null;
    internalNumber?: string | number | null;
    assetFamily?: {
      id?: string | null;
      code?: string | null;
      name?: string | null;
    } | null;
    imageUrl?: string | null;
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
  category?: 'INTERNAL' | 'PROVIDER';
  active: boolean;
  logoUrl?: string | null;
  logoKey?: string | null;
};

type WarehouseStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

const MAX_OWNER_LOGO_SIZE_BYTES = 1 * 1024 * 1024;
const OWNER_LOGO_MIME_TYPES = new Set(['image/png', 'image/webp', 'image/jpeg']);

function normalizeInventorySearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es');
}

function WarehouseIdentityMark({
  logoUrl,
  name,
  initials,
  size,
}: {
  logoUrl: string | null;
  name: string;
  initials: string;
  size: number;
}) {
  if (logoUrl) {
    return (
      <Box
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(10, Math.round(size * 0.18)),
          border: '1px solid rgba(15, 23, 42, 0.10)',
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <Box
          component="img"
          src={logoUrl}
          alt={`${name} logo`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            padding: Math.max(5, Math.round(size * 0.1)),
          }}
        />
      </Box>
    );
  }

  return (
    <ThemeIcon size={size} radius="xl" variant="light" color="blue" style={{ flexShrink: 0 }}>
      <Text fw={800} size={size >= 60 ? 'lg' : 'sm'}>
        {initials || 'BG'}
      </Text>
    </ThemeIcon>
  );
}

type WarehouseInventoryPageClientProps = {
  initialWarehouseId?: string;
  detailMode?: boolean;
};

export default function WarehouseInventoryPageClient({
  initialWarehouseId,
  detailMode = false,
}: WarehouseInventoryPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inventoryScope =
    !detailMode && searchParams.get('scope') === 'own' ? 'own' : 'allied';
  const inventoryView =
    searchParams.get('view') === 'bulk'
      ? 'BULK'
      : searchParams.get('view') === 'serial'
        ? 'SERIAL'
        : 'ALL';
  const isOwnInventory = inventoryScope === 'own';
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingSerialAssetId, setDeletingSerialAssetId] = useState<string | null>(null);
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
  const inventorySearchParam = isOwnInventory ? (searchParams.get('q') ?? '') : '';
  const [inventorySearch, setInventorySearchState] = useState(inventorySearchParam);
  const deferredInventorySearch = useDeferredValue(inventorySearch);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);
  const [warehousesError, setWarehousesError] = useState<string | null>(null);
  const [warehouseSearch, setWarehouseSearch] = useState('');
  const [warehouseStatusFilter, setWarehouseStatusFilter] =
    useState<WarehouseStatusFilter>('ALL');
  const [warehouseOwnerFilter, setWarehouseOwnerFilter] = useState<string | null>(null);
  const [warehouseFiltersOpen, setWarehouseFiltersOpen] = useState(false);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [ownersError, setOwnersError] = useState<string | null>(null);
  const [ownerLogoUploadingId, setOwnerLogoUploadingId] = useState<string | null>(null);
  const [ownerLogoError, setOwnerLogoError] = useState<string | null>(null);
  const [ownerCreateOpen, setOwnerCreateOpen] = useState(false);
  const [ownerCreateForm, setOwnerCreateForm] = useState<OwnerCreateForm>(emptyOwnerCreateForm);
  const [ownerCreateLoading, setOwnerCreateLoading] = useState(false);
  const [ownerCreateError, setOwnerCreateError] = useState<string | null>(null);
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
  const [addStockOpen, setAddStockOpen] = useState(false);

  useEffect(() => {
    setInventorySearchState(inventorySearchParam);
  }, [inventorySearchParam]);

  const setInventorySearch = (value: string) => {
    setInventorySearchState(value);
    const nextParams = new URLSearchParams(window.location.search);
    if (value) {
      nextParams.set('q', value);
    } else {
      nextParams.delete('q');
    }
    const query = nextParams.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}`,
    );
  };

  const ownerOptions = useMemo(() => {
    const ownersFromWarehouses = new Map<string, string>();
    warehouses.forEach((warehouse) => {
      const owner = warehouse.ownerCompany;
      if (owner?.id && owner?.name) {
        ownersFromWarehouses.set(owner.id, owner.name);
      }
    });

    const optionsFromOwners = owners
      .filter((owner) => isOwnInventory || owner.category !== 'INTERNAL')
      .map((owner) => ({
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
  }, [isOwnInventory, owners, warehouses]);

  const ownerById = useMemo(() => {
    return new Map(owners.map((owner) => [owner.id, owner]));
  }, [owners]);

  const typeOptions = [
    { value: 'OWN', label: 'Propia' },
    { value: 'ALLY', label: 'Aliada' },
  ];

  const activeOptions = [
    { value: 'true', label: 'Activa' },
    { value: 'false', label: 'Inactiva' },
  ];

  const handleFetch = async (
    targetWarehouseId?: string | null,
    knownWarehouses: Warehouse[] = warehouses,
  ) => {
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
          knownWarehouses.find((warehouse) => warehouse.id === warehouseToFetch)?.name ??
          'esta bodega';
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

  const openWarehouseDetail = (targetWarehouseId: string) => {
    router.push(`/inventory/warehouse/provider/${targetWarehouseId}`);
  };

  const bulkAdjustKey = (item: { skuId: string; ownerWarehouseId: string }) =>
    `${item.skuId}::${item.ownerWarehouseId}`;

  const loadWarehouses = async () => {
    setWarehousesLoading(true);
    setWarehousesError(null);
    try {
      const response = await api<Warehouse[]>('/warehouses', { method: 'GET' });
      const visibleWarehouses = response.filter((warehouse) =>
        isOwnInventory ? warehouse.type === 'OWN' : warehouse.type === 'ALLY',
      );
      setWarehouses(visibleWarehouses);

      if (isOwnInventory) {
        const ownWarehouse =
          visibleWarehouses.find((warehouse) => warehouse.active) ?? visibleWarehouses[0] ?? null;
        setWarehouseId(ownWarehouse?.id ?? null);
        setData(null);
        if (ownWarehouse) {
          await handleFetch(ownWarehouse.id, visibleWarehouses);
        }
      } else if (initialWarehouseId) {
        const selectedWarehouse =
          visibleWarehouses.find((warehouse) => warehouse.id === initialWarehouseId) ?? null;
        setWarehouseId(selectedWarehouse?.id ?? null);
        setData(null);
        if (selectedWarehouse) {
          await handleFetch(selectedWarehouse.id, visibleWarehouses);
        } else {
          setWarehousesError('No se encontró la bodega de este proveedor.');
        }
      } else {
        setWarehouseId(null);
        setData(null);
      }
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
    void loadWarehouses();
    loadOwners();
  }, [initialWarehouseId, inventoryScope]);

  useEffect(() => {
    const handleBulkStockMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'bulk-stock-cancelled') {
        setAddStockOpen(false);
        return;
      }
      if (event.data?.type !== 'bulk-stock-added') return;

      setAddStockOpen(false);
      void loadWarehouses();
      void handleFetch(event.data.warehouseId ?? warehouseId);
    };

    window.addEventListener('message', handleBulkStockMessage);
    return () => window.removeEventListener('message', handleBulkStockMessage);
  }, [warehouseId]);

  const openCreate = () => {
    setCreateName('');
    setCreateType('OWN');
    setCreateOwnerCompanyId(null);
    setCreateActive(true);
    setCreateError(null);
    setOwnerLogoError(null);
    setCreateOpen(true);
  };

  const openCreateOwner = () => {
    setOwnerCreateForm(emptyOwnerCreateForm);
    setOwnerCreateError(null);
    setOwnerCreateOpen(true);
  };

  const handleCreateOwner = async () => {
    const validationError = validateOwnerCreateForm(ownerCreateForm);
    if (validationError) {
      setOwnerCreateError(validationError);
      return;
    }

    setOwnerCreateLoading(true);
    setOwnerCreateError(null);
    try {
      const owner = await api<Owner>('/owners', {
        method: 'POST',
        json: {
          name: ownerCreateForm.name.trim(),
          nitOrId: buildOwnerNitOrId(ownerCreateForm) || undefined,
          phone: ownerCreateForm.phone.trim() || undefined,
          email: ownerCreateForm.email.trim() || undefined,
          active: true,
        },
      });
      setOwners((prev) =>
        [...prev.filter((item) => item.id !== owner.id), owner].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setCreateOwnerCompanyId(owner.id);
      if (editOpen) {
        setEditOwnerCompanyId(owner.id);
      }
      setOwnerCreateOpen(false);
      setOwnerCreateForm(emptyOwnerCreateForm);
    } catch (err) {
      if (err instanceof ApiError) {
        setOwnerCreateError(`Error ${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setOwnerCreateError(err.message);
      } else {
        setOwnerCreateError('No se pudo crear el dueño.');
      }
    } finally {
      setOwnerCreateLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!createOwnerCompanyId) {
      setCreateError('Selecciona una empresa dueña.');
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
      setEditError('Selecciona una empresa dueña.');
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

  const openAddStock = () => {
    if (!warehouseId) return;
    setAddStockOpen(true);
  };

  const addStockUrl = warehouseId
    ? `/inventory/bulk-adjustments?${new URLSearchParams({
        warehouseId,
        flow: 'bulk',
        step: 'operation',
        embed: '1',
      }).toString()}`
    : '';

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

  const deleteSerialAsset = async (item: InventoryResponse['serial'][number]) => {
    const label = item.serialOrEngine ?? item.description ?? 'este equipo';
    const reason = window.prompt(
      `Eliminar activo ${label}? El historial se conservará. Escribe el motivo:`,
    )?.trim();
    if (!reason) return;

    setDeletingSerialAssetId(item.assetId);
    setError(null);
    try {
      await api(`/assets/${item.assetId}`, { method: 'DELETE', json: { reason } });
      await handleFetch(data?.warehouseId ?? warehouseId);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('No se pudo eliminar el activo.');
      }
    } finally {
      setDeletingSerialAssetId(null);
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

  const filteredSerialInventory = useMemo(() => {
    const items = data?.serial ?? [];
    const query = normalizeInventorySearch(deferredInventorySearch);
    if (!query) return items;

    return items.filter((item) =>
      normalizeInventorySearch(
        [
          item.assetFamily?.name,
          item.assetFamily?.code,
          item.description,
          item.skuName,
          item.serialOrEngine,
          item.brand,
          item.model,
          item.internalNumber,
          item.skuId,
        ]
          .filter((value) => value != null && String(value).trim())
          .join(' '),
      ).includes(query),
    );
  }, [data, deferredInventorySearch]);
  const filteredBulkInventory = useMemo(() => {
    const items = data?.bulk ?? [];
    const query = normalizeInventorySearch(deferredInventorySearch);
    if (!query) return items;

    return items.filter((item) =>
      normalizeInventorySearch([item.skuName, item.skuId].filter(Boolean).join(' ')).includes(query),
    );
  }, [data, deferredInventorySearch]);
  const showOwnInventorySearch = isOwnInventory;
  const filteredInventoryCount =
    inventoryView === 'BULK' ? filteredBulkInventory.length : filteredSerialInventory.length;
  const totalInventoryCount = inventoryView === 'BULK' ? (data?.bulk.length ?? 0) : (data?.serial.length ?? 0);
  const inventoryItemLabel = inventoryView === 'BULK' ? 'referencias' : 'equipos';

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
  const warehouseOwnerFilterOptions = useMemo(() => {
    const uniqueOwners = new Map<string, string>();
    warehouseCards.forEach((warehouse) => {
      if (warehouse.ownerCompanyId) {
        uniqueOwners.set(warehouse.ownerCompanyId, warehouse.ownerName);
      }
    });

    return Array.from(uniqueOwners.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [warehouseCards]);
  const filteredWarehouseCards = useMemo(() => {
    const query = warehouseSearch.trim().toLocaleLowerCase('es');

    return warehouseCards.filter((warehouse) => {
      const matchesSearch =
        query.length === 0 ||
        warehouse.name.toLocaleLowerCase('es').includes(query) ||
        warehouse.ownerName.toLocaleLowerCase('es').includes(query);
      const matchesStatus =
        warehouseStatusFilter === 'ALL' ||
        (warehouseStatusFilter === 'ACTIVE' && warehouse.active) ||
        (warehouseStatusFilter === 'INACTIVE' && !warehouse.active);
      const matchesOwner =
        !warehouseOwnerFilter || warehouse.ownerCompanyId === warehouseOwnerFilter;

      return matchesSearch && matchesStatus && matchesOwner;
    });
  }, [warehouseCards, warehouseOwnerFilter, warehouseSearch, warehouseStatusFilter]);
  const activeWarehouseFilterCount =
    Number(warehouseStatusFilter !== 'ALL') + Number(Boolean(warehouseOwnerFilter));
  const clearWarehouseFilters = () => {
    setWarehouseStatusFilter('ALL');
    setWarehouseOwnerFilter(null);
  };
  const selectedWarehouse =
    warehouseCards.find((warehouse) => warehouse.id === warehouseId) ?? null;

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
            <Alert color="red" variant="light" title="No se pudo subir el logo">
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
            <Alert color="red" variant="light" title="No se pudieron cargar bodegas">
              {warehousesError}
            </Alert>
          ) : null}
          {ownersError ? (
            <Alert color="red" variant="light" title="No se pudieron cargar las empresas dueñas">
              {ownersError}
            </Alert>
          ) : null}
          {error ? (
            <Alert color="red" variant="light" title="No se pudo consultar el inventario">
              {error}
            </Alert>
          ) : null}

          {detailMode ? (
            <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
              {selectedWarehouse ? (
                <Stack gap="md">
                  <Button
                    variant="subtle"
                    color="gray"
                    px={0}
                    leftSection={<IconArrowLeft size={17} />}
                    onClick={() => router.push('/inventory/warehouse')}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    Volver a proveedores
                  </Button>
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
                      <WarehouseIdentityMark
                        logoUrl={selectedWarehouse.ownerLogoUrl}
                        name={selectedWarehouse.ownerName}
                        initials={selectedWarehouse.initials}
                        size={64}
                      />
                      <div style={{ minWidth: 0 }}>
                        <Text fw={800} size="lg" lineClamp={2}>
                          {selectedWarehouse.name}
                        </Text>
                        <Text size="sm" c="dimmed" lineClamp={1}>
                          {selectedWarehouse.ownerName}
                        </Text>
                        <Badge
                          mt={7}
                          color={selectedWarehouse.active ? 'green' : 'gray'}
                          variant="light"
                        >
                          {selectedWarehouse.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </div>
                    </Group>
                    <ActionIcon
                      variant="light"
                      color="gray"
                      size="lg"
                      radius="xl"
                      aria-label={`Editar ${selectedWarehouse.name}`}
                      onClick={() => openEdit(selectedWarehouse)}
                    >
                      <IconEdit size={17} />
                    </ActionIcon>
                  </Group>
                </Stack>
              ) : (
                <Group gap="sm">
                  <ThemeIcon variant="light" color="blue" radius="xl">
                    <IconBuildingWarehouse size={18} />
                  </ThemeIcon>
                  <Text c="dimmed">
                    {warehousesLoading ? 'Cargando proveedor...' : 'Proveedor no encontrado.'}
                  </Text>
                </Group>
              )}
            </Paper>
          ) : !isOwnInventory ? (
            <section className={classes.providerDirectory}>
              <Stack gap="xl">
                <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
                  <div>
                    <Text component="h1" className="ui-text-title" m={0}>
                      Bodegas de proveedores
                    </Text>
                    <Text className="ui-text-body" mt={6}>
                      Consulta y administra el inventario de tus proveedores.
                    </Text>
                  </div>
                  <Button
                    onClick={openCreate}
                    leftSection={<IconPlus size={17} />}
                    className={classes.createButton}
                  >
                    Crear bodega
                  </Button>
                </Group>

                <div className={classes.desktopFilters}>
                  <TextInput
                    aria-label="Buscar proveedor o bodega"
                    placeholder="Buscar proveedor o bodega"
                    leftSection={<IconSearch size={18} />}
                    value={warehouseSearch}
                    onChange={(event) => setWarehouseSearch(event.currentTarget.value)}
                    className={classes.searchInput}
                  />
                  <div>
                    <Text className="ui-text-label" mb={6}>
                      Estado
                    </Text>
                    <SegmentedControl
                      value={warehouseStatusFilter}
                      onChange={(value) =>
                        setWarehouseStatusFilter(value as WarehouseStatusFilter)
                      }
                      data={[
                        { value: 'ALL', label: 'Todas' },
                        { value: 'ACTIVE', label: 'Activas' },
                        { value: 'INACTIVE', label: 'Inactivas' },
                      ]}
                    />
                  </div>
                  <Select
                    label="Proveedor"
                    placeholder="Todos"
                    clearable
                    searchable
                    data={warehouseOwnerFilterOptions}
                    value={warehouseOwnerFilter}
                    onChange={setWarehouseOwnerFilter}
                  />
                </div>

                <div className={classes.mobileFilters}>
                  <TextInput
                    aria-label="Buscar proveedor o bodega"
                    placeholder="Buscar proveedor o bodega"
                    leftSection={<IconSearch size={18} />}
                    value={warehouseSearch}
                    onChange={(event) => setWarehouseSearch(event.currentTarget.value)}
                    className={classes.mobileSearchInput}
                  />
                  <Button
                    variant="default"
                    leftSection={<IconFilter size={17} />}
                    onClick={() => setWarehouseFiltersOpen(true)}
                    aria-label={
                      activeWarehouseFilterCount > 0
                        ? `Filtros, ${activeWarehouseFilterCount} activos`
                        : 'Filtros'
                    }
                  >
                    Filtros{activeWarehouseFilterCount > 0 ? ` · ${activeWarehouseFilterCount}` : ''}
                  </Button>
                </div>

                <Text size="sm" c="dimmed" fw={500}>
                  {warehousesLoading
                    ? 'Cargando bodegas...'
                    : `${filteredWarehouseCards.length} ${
                        filteredWarehouseCards.length === 1 ? 'bodega' : 'bodegas'
                      }`}
                </Text>

                <Paper withBorder radius="md" p={0} className={classes.tableSurface}>
                  <Table visibleFrom="sm" verticalSpacing="md" horizontalSpacing="lg">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Bodega</Table.Th>
                        <Table.Th>Proveedor</Table.Th>
                        <Table.Th>Estado</Table.Th>
                        <Table.Th ta="right">Acciones</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {filteredWarehouseCards.map((warehouse) => (
                        <Table.Tr key={warehouse.id} className={classes.tableRow}>
                          <Table.Td>
                            <Group gap="sm" wrap="nowrap">
                              <WarehouseIdentityMark
                                logoUrl={warehouse.ownerLogoUrl}
                                name={warehouse.ownerName}
                                initials={warehouse.initials}
                                size={44}
                              />
                              <Text fw={700} c="var(--ui-color-title)" lineClamp={2}>
                                {warehouse.name}
                              </Text>
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" c="var(--ui-color-body)" lineClamp={2}>
                              {warehouse.ownerName}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Badge
                              color={warehouse.active ? 'green' : 'red'}
                              variant="light"
                              size="md"
                            >
                              {warehouse.active ? 'Activa' : 'Inactiva'}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Group justify="flex-end" gap="sm" wrap="nowrap">
                              <TableRowActions
                                actions={[
                                  {
                                    key: 'edit',
                                    label: `Editar ${warehouse.name}`,
                                    icon: <IconEdit size={16} />,
                                    onClick: () => openEdit(warehouse),
                                  },
                                ]}
                              />
                              <Button
                                variant="subtle"
                                size="compact-sm"
                                rightSection={<IconChevronRight size={15} />}
                                onClick={() => openWarehouseDetail(warehouse.id)}
                              >
                                Ver inventario
                              </Button>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>

                  <Box hiddenFrom="sm" className={classes.mobileList}>
                    {filteredWarehouseCards.map((warehouse) => (
                      <div key={warehouse.id} className={classes.mobileRow}>
                        <Group gap="sm" wrap="nowrap" className={classes.mobileIdentity}>
                          <WarehouseIdentityMark
                            logoUrl={warehouse.ownerLogoUrl}
                            name={warehouse.ownerName}
                            initials={warehouse.initials}
                            size={42}
                          />
                          <div className={classes.mobileRowCopy}>
                            <Text fw={700} size="sm" c="var(--ui-color-title)" truncate>
                              {warehouse.name}
                            </Text>
                            <Text size="xs" c="dimmed" truncate>
                              {warehouse.ownerName}
                            </Text>
                            <Text
                              size="xs"
                              fw={600}
                              c={warehouse.active ? 'green.7' : 'red.7'}
                            >
                              {warehouse.active ? 'Activa' : 'Inactiva'}
                            </Text>
                          </div>
                        </Group>
                        <Group gap={4} wrap="nowrap">
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label={`Editar ${warehouse.name}`}
                            onClick={() => openEdit(warehouse)}
                          >
                            <IconEdit size={17} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            color="blue"
                            aria-label={`Ver inventario de ${warehouse.name}`}
                            onClick={() => openWarehouseDetail(warehouse.id)}
                          >
                            <IconChevronRight size={18} />
                          </ActionIcon>
                        </Group>
                      </div>
                    ))}
                  </Box>

                  {!warehousesLoading && filteredWarehouseCards.length === 0 ? (
                    <Stack align="center" gap={4} py={48} px="md">
                      <Text fw={700} c="var(--ui-color-title)">
                        No encontramos bodegas
                      </Text>
                      <Text size="sm" c="dimmed" ta="center">
                        Ajusta la búsqueda o limpia los filtros para ver más resultados.
                      </Text>
                      {activeWarehouseFilterCount > 0 ? (
                        <Button variant="subtle" size="compact-sm" onClick={clearWarehouseFilters}>
                          Limpiar filtros
                        </Button>
                      ) : null}
                    </Stack>
                  ) : null}
                </Paper>
              </Stack>
            </section>
          ) : (
            <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
              <Group justify="space-between" align="center" wrap="wrap">
                <div>
                  <Text fw={700}>
                    {inventoryView === 'BULK' ? 'Bulk propio' : 'Equipos propios'}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {warehouses[0]
                      ? `${warehouses[0].name} está cargada automáticamente.`
                      : warehousesLoading
                        ? 'Buscando la bodega propia...'
                        : 'No hay una bodega propia configurada.'}
                  </Text>
                </div>
                {warehouses[0] ? (
                  <Badge color="orange" variant="light">
                    Bodega propia
                  </Badge>
                ) : null}
              </Group>
            </Paper>
          )}

          {data ? (
            <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
              <Stack gap="md">
                <div>
                  <Text fw={700}>Resultado de inventario</Text>
                  <Text size="sm" c="dimmed">
                    {isOwnInventory
                      ? inventoryView === 'BULK'
                        ? 'Stock masivo disponible en nuestra bodega.'
                        : 'Equipos únicos disponibles en nuestra bodega.'
                      : 'Stock masivo y equipos únicos de la bodega seleccionada.'}
                  </Text>
                </div>
                {showOwnInventorySearch ? (
                  <Stack gap={6}>
                    <TextInput
                      type="search"
                      aria-label={inventoryView === 'BULK' ? 'Buscar inventario bulk' : 'Buscar equipos propios'}
                      placeholder={
                        inventoryView === 'BULK'
                          ? 'Buscar por referencia o nombre'
                          : 'Buscar por equipo, familia, serial o número interno'
                      }
                      leftSection={<IconSearch size={18} />}
                      rightSection={
                        inventorySearch ? (
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label="Limpiar búsqueda de inventario"
                            onClick={() => setInventorySearch('')}
                          >
                            <IconX size={16} />
                          </ActionIcon>
                        ) : null
                      }
                      value={inventorySearch}
                      onChange={(event) => setInventorySearch(event.currentTarget.value)}
                    />
                    <Text size="sm" c="dimmed">
                      {inventorySearch.trim()
                        ? `${filteredInventoryCount} de ${totalInventoryCount} ${inventoryItemLabel}`
                        : `${totalInventoryCount} ${inventoryItemLabel}`}
                    </Text>
                  </Stack>
                ) : null}
                {showOwnInventorySearch &&
                inventorySearch.trim() &&
                filteredInventoryCount === 0 ? (
                  <Paper withBorder radius="md" p="xl">
                    <Stack align="center" gap={6}>
                      <Text fw={700}>
                        {inventoryView === 'BULK' ? 'No encontramos referencias bulk' : 'No encontramos equipos'}
                      </Text>
                      <Text size="sm" c="dimmed" ta="center">
                        {inventoryView === 'BULK'
                          ? 'Prueba con otro nombre o referencia.'
                          : 'Prueba con otra familia, referencia, serial o número interno.'}
                      </Text>
                      <Button variant="subtle" size="compact-sm" onClick={() => setInventorySearch('')}>
                        Limpiar búsqueda
                      </Button>
                    </Stack>
                  </Paper>
                ) : (
                <InventoryDisplay
                  bulk={showOwnInventorySearch ? filteredBulkInventory : data.bulk}
                  serial={showOwnInventorySearch ? filteredSerialInventory : data.serial}
                  onAdjust={openAdjust}
                  onAddStock={openAddStock}
                  onDeleteSerialAsset={deleteSerialAsset}
                  deletingSerialAssetId={deletingSerialAssetId}
                  viewFilter={isOwnInventory ? inventoryView : 'ALL'}
                  compactSerialCards={isOwnInventory && inventoryView === 'SERIAL'}
                  showSerialOwnerChip={isOwnInventory}
                  serialAssetScope={isOwnInventory ? 'own' : 'allied'}
                  showWorksiteQuantities={!isOwnInventory}
                />
                )}
              </Stack>
            </Paper>
          ) : null}
        </Stack>
      </Container>

      <Drawer
        opened={warehouseFiltersOpen}
        onClose={() => setWarehouseFiltersOpen(false)}
        title="Filtrar bodegas"
        position="bottom"
        size="auto"
        hiddenFrom="sm"
      >
        <Stack gap="lg" pb="md">
          <Select
            label="Estado"
            data={[
              { value: 'ALL', label: 'Todas' },
              { value: 'ACTIVE', label: 'Activas' },
              { value: 'INACTIVE', label: 'Inactivas' },
            ]}
            value={warehouseStatusFilter}
            onChange={(value) =>
              setWarehouseStatusFilter((value as WarehouseStatusFilter | null) ?? 'ALL')
            }
          />
          <Select
            label="Proveedor"
            placeholder="Todos"
            clearable
            searchable
            data={warehouseOwnerFilterOptions}
            value={warehouseOwnerFilter}
            onChange={setWarehouseOwnerFilter}
          />
          <Group grow>
            <Button variant="default" onClick={clearWarehouseFilters}>
              Limpiar
            </Button>
            <Button onClick={() => setWarehouseFiltersOpen(false)}>Ver resultados</Button>
          </Group>
        </Stack>
      </Drawer>

      <Modal
        opened={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Ajuste de stock masivo"
        size="lg"
      >
        {!adjustReady ? (
          <div>
            <Text c="dimmed" mb="sm">
              Confirma tus credenciales de administrador para continuar.
            </Text>
            <TextInput
              label="Correo"
              type="email"
              value={reauthEmail}
              onChange={(event) => setReauthEmail(event.target.value)}
            />
            <TextInput
              label="Contraseña"
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
              Ingresa la cantidad final deseada por SKU (0 lo elimina del stock masivo).
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
        opened={addStockOpen}
        onClose={() => setAddStockOpen(false)}
        title="Agregar stock"
        size="95%"
        centered
        styles={{
          body: { padding: 0 },
          content: { overflow: 'hidden' },
        }}
      >
        {addStockUrl ? (
          <Box
            component="iframe"
            src={addStockUrl}
            title="Agregar stock masivo"
            style={{
              width: '100%',
              height: 'min(82vh, 920px)',
              border: 0,
              display: 'block',
              background: '#f8fafc',
            }}
          />
        ) : null}
      </Modal>

      <Modal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Crear bodega"
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
                <Text fw={700}>Nueva bodega operativa</Text>
                <Text size="sm" c="dimmed" mt={4}>
                  Define nombre, tipo, dueño y estado inicial para dejarla lista en el sistema.
                </Text>
              </div>
              <Badge color={createType === 'OWN' ? 'orange' : 'blue'} variant="light">
                {createType === 'OWN' ? 'Propia' : 'Aliada'}
              </Badge>
            </Group>
          </Paper>

          <Paper withBorder radius="lg" p="md">
            <Stack gap="md">
              <div>
                <Text fw={700}>Identidad de la bodega</Text>
                <Text size="sm" c="dimmed">
                  Usa un nombre claro y asignala al dueño correcto desde el inicio.
                </Text>
              </div>

              <TextInput
                label="Nombre"
                placeholder="Ejemplo: Bodega principal norte"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
              />

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <Select
                  label="Tipo"
                  data={typeOptions}
                  value={createType}
                  onChange={(value) => setCreateType((value as 'OWN' | 'ALLY') ?? 'OWN')}
                />
                <Select
                  label="Estado"
                  data={activeOptions}
                  value={String(createActive)}
                  onChange={(value) => setCreateActive(value === 'true')}
                />
              </SimpleGrid>

              <Group align="flex-end" wrap="nowrap">
                <Select
                  label="Empresa dueña"
                  placeholder={ownersLoading ? 'Cargando dueños...' : 'Seleccionar dueño'}
                  data={ownerOptions}
                  value={createOwnerCompanyId}
                  onChange={(value) => {
                    setOwnerLogoError(null);
                    setCreateOwnerCompanyId(value);
                  }}
                  disabled={ownersLoading && ownerOptions.length === 0}
                  searchable
                  style={{ flex: 1 }}
                />
                <Button variant="light" onClick={openCreateOwner} leftSection={<IconPlus size={16} />}>
                  Crear dueño
                </Button>
              </Group>

              {renderOwnerLogoUpload(createOwnerCompanyId, createOwner)}
            </Stack>
          </Paper>

          {createError ? (
            <Alert color="red" variant="light" title="No se pudo crear la bodega">
              {createError}
            </Alert>
          ) : null}

          <Group justify="space-between" className="mobile-actions">
            <Button variant="default" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              loading={createLoading}
              disabled={!createOwnerCompanyId}
            >
              Crear bodega
            </Button>
          </Group>
        </Stack>
      </Modal>

      <OwnerCreateModal
        opened={ownerCreateOpen}
        form={ownerCreateForm}
        loading={ownerCreateLoading}
        error={ownerCreateError}
        onClose={() => setOwnerCreateOpen(false)}
        onCreate={handleCreateOwner}
        onChange={setOwnerCreateForm}
      />

      <Modal
        opened={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar bodega"
        size="lg"
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
          placeholder={ownersLoading ? 'Cargando dueños...' : 'Seleccionar dueño'}
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
            ? `Seguro que quieres eliminar la bodega "${deleteTarget.name}"?`
            : 'Seguro que quieres eliminar esta bodega?'}
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
          <strong>{emptyInventoryWarehouseName.toUpperCase()}</strong> esta vacia: todavia no hay
          inventario para mostrar.
        </Text>
        <Group mt="md" justify="flex-end">
          <Button onClick={() => setEmptyInventoryOpen(false)}>Entendido</Button>
        </Group>
      </Modal>
    </main>
  );
}
