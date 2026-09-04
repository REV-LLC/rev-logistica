'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Menu, TextInput } from '@mantine/core';
import {
  IconArrowsSort,
  IconBuildingWarehouse,
  IconChevronDown,
  IconFilter,
  IconSearch,
  IconTools,
  IconX,
  IconArrowRight,
  IconBuilding,
  IconCheck,
  IconMapPin,
} from '@tabler/icons-react';
import SerialAssetCard from '@/components/SerialAssetCard';
import DataTableToolbar from '@/components/tables/DataTableToolbar';
import classes from '@/components/WarehouseAssetsView.module.css';

type AssetStatusFilter = 'ALL' | 'AVAILABLE' | 'WORKSITE' | 'WORKSHOP' | 'RESERVED' | 'INACTIVE' | 'TRANSIT';
type AssetOrder = 'NAME' | 'INTERNAL_ASC' | 'INTERNAL_DESC';

export type WarehouseAssetItem = {
  assetId: string;
  ownerWarehouseId?: string | null;
  ownerWarehouseName?: string | null;
  serialOrEngine: string | null;
  description: string | null;
  skuName?: string | null;
  imageUrl?: string | null;
  imageFileObjectId: string | null;
  brand?: string | null;
  model?: string | null;
  status?: 'IN' | 'OUT' | 'TRANSIT' | string | null;
  location?: { type: 'WAREHOUSE' | 'WORKSITE' | 'TRANSIT'; name: string | null } | null;
  internalNumber?: string | number | null;
  assetFamily?: { id?: string | null; code?: string | null; name?: string | null } | null;
  assetSubfamily?: { id?: string | null; code?: string | null; name?: string | null } | null;
  quantity: number;
};

const FILTERS: Array<{ value: AssetStatusFilter; label: string; color?: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'AVAILABLE', label: 'Disponibles', color: '#16a34a' },
  { value: 'WORKSITE', label: 'En obra', color: '#1677ed' },
  { value: 'WORKSHOP', label: 'En taller', color: '#f36a0a' },
  { value: 'RESERVED', label: 'Reservados', color: '#6d45d8' },
  { value: 'INACTIVE', label: 'Inactivos', color: '#a8afb9' },
];

function normalized(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function statusFor(item: WarehouseAssetItem): AssetStatusFilter {
  const status = normalized(item.status).toUpperCase();
  const locationName = normalized(item.location?.name);
  if (status === 'INACTIVE') return 'INACTIVE';
  if (status === 'RESERVED') return 'RESERVED';
  if (status === 'WORKSHOP' || locationName.includes('taller')) return 'WORKSHOP';
  if (item.location?.type === 'TRANSIT' || status === 'TRANSIT') return 'TRANSIT';
  if (item.location?.type === 'WORKSITE' || status === 'OUT') return 'WORKSITE';
  return 'AVAILABLE';
}

function statusBadge(item: WarehouseAssetItem) {
  const status = statusFor(item);
  if (status === 'WORKSITE') return { label: 'EN OBRA', color: 'blue' };
  if (status === 'WORKSHOP') return { label: 'EN TALLER', color: 'orange' };
  if (status === 'RESERVED') return { label: 'RESERVADO', color: 'violet' };
  if (status === 'INACTIVE') return { label: 'INACTIVO', color: 'gray' };
  if (status === 'TRANSIT') return { label: 'EN TRÁNSITO', color: 'yellow' };
  return { label: 'DISPONIBLE', color: 'green' };
}

export default function WarehouseAssetsView({
  items,
  warehouseName,
  warehouseType,
  search,
  onSearchChange,
  onDelete,
  deletingId,
  error,
}: {
  items: WarehouseAssetItem[];
  warehouseName: string;
  warehouseType: 'OWN' | 'ALLY';
  search: string;
  onSearchChange: (value: string) => void;
  onDelete?: (item: WarehouseAssetItem) => void;
  deletingId?: string | null;
  error?: string | null;
}) {
  const [filter, setFilter] = useState<AssetStatusFilter>('ALL');
  const [order, setOrder] = useState<AssetOrder>('NAME');

  const filteredItems = useMemo(() => {
    const query = normalized(search.trim());
    return items
      .filter((item) => filter === 'ALL' || statusFor(item) === filter)
      .filter((item) => !query || normalized([
        item.assetFamily?.name,
        item.assetSubfamily?.name,
        item.assetSubfamily?.code,
        item.description,
        item.skuName,
        item.serialOrEngine,
        item.internalNumber,
        item.brand,
        item.model,
      ].join(' ')).includes(query))
      .toSorted((a, b) => {
        if (order === 'INTERNAL_ASC' || order === 'INTERNAL_DESC') {
          const delta = String(a.internalNumber ?? '').localeCompare(
            String(b.internalNumber ?? ''),
            'es',
            { numeric: true, sensitivity: 'base' },
          );
          return order === 'INTERNAL_ASC' ? delta : -delta;
        }
        return normalized([
          a.assetFamily?.name,
          a.assetSubfamily?.name,
          a.skuName,
          a.description,
        ].join(' ')).localeCompare(normalized([
          b.assetFamily?.name,
          b.assetSubfamily?.name,
          b.skuName,
          b.description,
        ].join(' ')), 'es');
      });
  }, [filter, items, order, search]);

  const families = useMemo(() => {
    const grouped = new Map<string, {
      id: string;
      name: string;
      count: number;
      subfamilies: Map<string, { id: string; name: string; items: WarehouseAssetItem[] }>;
    }>();

    filteredItems.forEach((item) => {
      const familyName = item.assetFamily?.name || 'Sin familia';
      const familyId = item.assetFamily?.id || item.assetFamily?.code || familyName;
      const subfamilyName = item.assetSubfamily?.name || 'Sin subfamilia';
      const subfamilyId = item.assetSubfamily?.id || item.assetSubfamily?.code || subfamilyName;
      let family = grouped.get(familyId);

      if (!family) {
        family = { id: familyId, name: familyName, count: 0, subfamilies: new Map() };
        grouped.set(familyId, family);
      }

      family.count += 1;
      const subfamily = family.subfamilies.get(subfamilyId);
      if (subfamily) subfamily.items.push(item);
      else family.subfamilies.set(subfamilyId, { id: subfamilyId, name: subfamilyName, items: [item] });
    });

    return Array.from(grouped.values())
      .map((family) => ({
        ...family,
        subfamilies: Array.from(family.subfamilies.values()).toSorted((a, b) =>
          a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' }),
        ),
      }))
      .toSorted((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [filteredItems]);

  return (
    <section className={classes.page}>
      <header className={classes.header}>
        <div>
          <h1 className={classes.title}>{warehouseType === 'OWN' ? 'Equipos propios' : 'Equipos del proveedor'}</h1>
          <div className={classes.subtitle}>
            <span className={classes.warehouseName}>{warehouseName}</span>
            <span aria-hidden="true">•</span>
            <span className={classes.count}>{items.length} {items.length === 1 ? 'equipo' : 'equipos'}</span>
          </div>
        </div>
        <div className={classes.typeChip}>
          <IconBuildingWarehouse size={19} stroke={2} />
          {warehouseType === 'OWN' ? 'Bodega propia' : 'Bodega proveedora'}
        </div>
      </header>

      <div className={classes.toolbar}>
        <DataTableToolbar mb={0} controlsStyle={{ flex: '1 1 100%' }}>
          <div className={classes.searchRow}>
            <TextInput
              className={classes.search}
              aria-label="Buscar equipo, serial o placa"
              placeholder="Buscar equipo, serial o placa..."
              leftSection={<IconSearch size={21} stroke={1.8} />}
              rightSection={search ? (
                <Button variant="subtle" color="gray" px={6} aria-label="Limpiar búsqueda" onClick={() => onSearchChange('')}>
                  <IconX size={17} />
                </Button>
              ) : null}
              value={search}
              onChange={(event) => onSearchChange(event.currentTarget.value)}
            />
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <Button
                  variant="default"
                  className={classes.control}
                  leftSection={<IconFilter size={18} />}
                  rightSection={<IconChevronDown size={16} />}
                >
                  Filtros
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Estado del equipo</Menu.Label>
                {FILTERS.map((option) => (
                  <Menu.Item
                    key={option.value}
                    leftSection={filter === option.value ? <IconCheck size={15} /> : <span className={classes.menuSpacer} />}
                    onClick={() => setFilter(option.value)}
                  >
                    {option.label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <Button variant="default" className={classes.control} leftSection={<IconArrowsSort size={18} />} rightSection={<IconChevronDown size={16} />}>
                  Ordenar
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={order === 'NAME' ? <IconCheck size={15} /> : <span className={classes.menuSpacer} />} onClick={() => setOrder('NAME')}>Nombre</Menu.Item>
                <Menu.Item leftSection={order === 'INTERNAL_ASC' ? <IconCheck size={15} /> : <span className={classes.menuSpacer} />} onClick={() => setOrder('INTERNAL_ASC')}>ID interno ascendente</Menu.Item>
                <Menu.Item leftSection={order === 'INTERNAL_DESC' ? <IconCheck size={15} /> : <span className={classes.menuSpacer} />} onClick={() => setOrder('INTERNAL_DESC')}>ID interno descendente</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </div>
        </DataTableToolbar>

        <div className={classes.filters} aria-label="Filtrar equipos por estado">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`${classes.filter} ${filter === option.value ? classes.filterActive : ''}`}
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.color ? <span className={classes.dot} style={{ background: option.color }} /> : null}
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className={classes.content}>
        {error ? (
          <Alert color="red" variant="light" title="No se pudo actualizar el inventario" mb="lg">
            {error}
          </Alert>
        ) : null}
        <div className={classes.sectionHeading}>
          <h2>Equipos únicos</h2>
          <span>{filteredItems.length} {filteredItems.length === 1 ? 'resultado' : 'resultados'}</span>
        </div>

        {families.map((family) => (
          <section className={classes.family} key={family.id}>
            <div className={classes.familyHeader}>
              <div className={classes.familyIcon}><IconTools size={24} stroke={1.8} /></div>
              <div>
                <div className={classes.familyName}>{family.name}</div>
                <div className={classes.familyCount}>{family.count} {family.count === 1 ? 'equipo' : 'equipos'}</div>
              </div>
            </div>
            <div className={classes.subfamilyList}>
              {family.subfamilies.map((subfamily) => (
                <section className={classes.subfamily} key={subfamily.id}>
                  <div className={classes.subfamilyHeader}>
                    <h3>{subfamily.name}</h3>
                    <span>{subfamily.items.length} {subfamily.items.length === 1 ? 'equipo' : 'equipos'}</span>
                  </div>
                  <div className={classes.grid}>
                    {subfamily.items.map((item) => (
                      <SerialAssetCard
                        key={item.assetId}
                        item={item}
                        href={`/inventory/serialized-assets/${item.assetId}?scope=${warehouseType === 'OWN' ? 'own' : 'allied'}`}
                        showcase
                        statusBadge={statusBadge(item)}
                        display={{ showOwnerChip: false, showCharge: false }}
                        additionalDetails={[{
                          label: 'Ubicación',
                          value: item.location?.name || (item.location?.type === 'WORKSITE' ? 'En obra' : warehouseName),
                          icon: <IconMapPin size={17} stroke={1.8} />,
                          hideLabel: true,
                        }, {
                          label: 'Dueño',
                          value: item.ownerWarehouseName || warehouseName,
                          icon: <IconBuilding size={17} stroke={1.8} />,
                          hideLabel: true,
                        }, {
                          label: 'ID interno',
                          value: item.internalNumber ?? item.serialOrEngine ?? '-',
                        }]}
                        footer={(
                          <Button
                            component="a"
                            href={`/inventory/serialized-assets/${item.assetId}?scope=${warehouseType === 'OWN' ? 'own' : 'allied'}`}
                            variant="subtle"
                            color="orange"
                            px={0}
                            rightSection={<IconArrowRight size={17} />}
                            style={{ alignSelf: 'flex-start' }}
                          >
                            Ver equipo
                          </Button>
                        )}
                        deleteLoading={deletingId === item.assetId}
                        onDelete={onDelete ? () => onDelete(item) : undefined}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        ))}

        {families.length === 0 ? (
          <div className={classes.empty}>
            <IconTools size={30} stroke={1.5} />
            <p>No encontramos equipos con estos criterios.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
