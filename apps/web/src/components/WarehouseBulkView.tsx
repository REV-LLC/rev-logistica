'use client';

import { useMemo, useState } from 'react';
import { ActionIcon, Button, Menu, TextInput } from '@mantine/core';
import { IconArrowsSort, IconBuildingWarehouse, IconCheck, IconChevronDown, IconFilter, IconSearch, IconX } from '@tabler/icons-react';
import InventoryDisplay, { type BulkItem } from '@/components/InventoryDisplay';
import classes from '@/components/WarehouseAssetsView.module.css';

type StockFilter = 'ALL' | 'AVAILABLE' | 'EMPTY' | 'NEGATIVE';
const filters: Array<{ value: StockFilter; label: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'AVAILABLE', label: 'Disponibles' },
  { value: 'EMPTY', label: 'Sin existencias' },
  { value: 'NEGATIVE', label: 'Saldo negativo' },
];
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

export default function WarehouseBulkView({ items, warehouseId, warehouseName, search, onSearchChange, onAddStock, onAdjust }: {
  items: BulkItem[];
  warehouseId: string;
  warehouseName: string;
  search: string;
  onSearchChange: (value: string) => void;
  onAddStock: () => void;
  onAdjust: () => void;
}) {
  const [filter, setFilter] = useState<StockFilter>('ALL');
  const [descending, setDescending] = useState(false);
  const referenceCount = new Set(items.map(item => item.skuId)).size;
  const visible = useMemo(() => {
    const totals = new Map<string, number>();
    const matchingReferences = new Set<string>();
    const query = normalize(search.trim());
    for (const item of items) {
      totals.set(item.skuId, (totals.get(item.skuId) ?? 0) + item.quantity);
      if (normalize([item.name, item.skuName, item.category, item.skuId].filter(Boolean).join(' ')).includes(query)) matchingReferences.add(item.skuId);
    }
    return items.filter(item => {
      const quantity = totals.get(item.skuId) ?? 0;
      return matchingReferences.has(item.skuId) && (filter === 'ALL'
        || (filter === 'AVAILABLE' && quantity > 0)
        || (filter === 'EMPTY' && quantity === 0)
        || (filter === 'NEGATIVE' && quantity < 0));
    }).sort((a, b) => (descending ? -1 : 1) * (a.name ?? a.skuName ?? '').localeCompare(b.name ?? b.skuName ?? '', 'es', { numeric: true }));
  }, [items, search, filter, descending]);
  const visibleCount = new Set(visible.map(item => item.skuId)).size;

  return (
    <section className={classes.page}>
      <header className={classes.header}>
        <div>
          <h1 className={classes.title}>Materiales y consumibles</h1>
          <div className={classes.subtitle}>
            <span className={classes.warehouseName}>{warehouseName}</span>
            <span className={classes.count}>{referenceCount} {referenceCount === 1 ? 'referencia' : 'referencias'}</span>
          </div>
        </div>
        <div className={classes.typeChip}><IconBuildingWarehouse size={19} />Bodega propia</div>
      </header>
      <div className={classes.toolbar}>
        <div className={classes.searchRow}>
          <TextInput className={classes.search} type="search" aria-label="Buscar inventario masivo" placeholder="Buscar por referencia, nombre o familia..."
            leftSection={<IconSearch size={21} />} value={search} onChange={event => onSearchChange(event.currentTarget.value)}
            rightSection={search ? <ActionIcon variant="subtle" color="gray" aria-label="Limpiar búsqueda" onClick={() => onSearchChange('')}><IconX size={17} /></ActionIcon> : null} />
          <Menu position="bottom-end" withinPortal>
            <Menu.Target><Button variant="default" className={classes.control} leftSection={<IconFilter size={18} />} rightSection={<IconChevronDown size={16} />}>Filtros</Button></Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Existencias en bodega</Menu.Label>
              {filters.map(option => <Menu.Item key={option.value} leftSection={filter === option.value ? <IconCheck size={15} /> : <span className={classes.menuSpacer} />} onClick={() => setFilter(option.value)}>{option.label}</Menu.Item>)}
            </Menu.Dropdown>
          </Menu>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target><Button variant="default" className={classes.control} leftSection={<IconArrowsSort size={18} />} rightSection={<IconChevronDown size={16} />}>Ordenar</Button></Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => setDescending(false)} leftSection={!descending ? <IconCheck size={15} /> : <span className={classes.menuSpacer} />}>Nombre A–Z</Menu.Item>
              <Menu.Item onClick={() => setDescending(true)} leftSection={descending ? <IconCheck size={15} /> : <span className={classes.menuSpacer} />}>Nombre Z–A</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
        <div className={classes.filters} aria-label="Filtrar materiales por existencias">
          {filters.map(option => <button type="button" key={option.value} aria-pressed={filter === option.value} className={`${classes.filter} ${filter === option.value ? classes.filterActive : ''}`} onClick={() => setFilter(option.value)}>{option.label}</button>)}
        </div>
      </div>
      <div className={classes.content}>
        <InventoryDisplay warehouseId={warehouseId} bulk={visible} serial={[]} viewFilter="BULK" bulkCatalogLayout
          onAddStock={onAddStock} onAdjust={onAdjust} showWorksiteQuantities />
        {!visibleCount ? <div className={classes.empty}>
          <p>{referenceCount ? 'No encontramos materiales con esta búsqueda o filtro.' : 'No hay materiales en esta bodega.'}</p>
          {referenceCount ? <div><Button variant="subtle" mt="sm" onClick={() => { onSearchChange(''); setFilter('ALL'); }}>Limpiar filtros</Button></div> : null}
        </div> : null}
      </div>
    </section>
  );
}
