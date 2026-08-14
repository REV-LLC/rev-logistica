'use client';

import { Container, Stack } from '@mantine/core';
import { IconBarcode, IconBuildingWarehouse, IconEngine, IconMapPin } from '@tabler/icons-react';
import { useState } from 'react';
import AssetDetailsPanel, { type AssetDetailSection } from './AssetDetailsPanel';
import AssetMovementSummary from './AssetMovementSummary';
import SerializedAssetEditForm from './SerializedAssetEditForm';
import SerializedAssetHero, { type SerializedAssetFact } from './SerializedAssetHero';

export type SerializedAssetLabComponent = 'hero' | 'details' | 'edit-form' | 'movement-summary';

const FACTS: SerializedAssetFact[] = [
  { label: 'Serial / motor', value: '123', icon: <IconEngine size={18} /> },
  { label: 'Codigo publico', value: 'DMD-0160-0001', icon: <IconBarcode size={18} /> },
  { label: 'Bodega dueña', value: 'REV', icon: <IconBuildingWarehouse size={18} /> },
  { label: 'Ubicacion actual', value: 'REV', icon: <IconMapPin size={18} /> },
];

const SECTIONS: AssetDetailSection[] = [
  {
    title: 'Identificacion',
    fields: [
      { label: 'Referencia / plantilla', value: 'BOSCH 11E' },
      { label: 'Familia', value: 'DEMOLEDOR' },
      { label: 'Estado', value: 'Activo' },
    ],
  },
  {
    title: 'Datos tecnicos',
    fields: [
      { label: 'Marca', value: 'BOSCH' },
      { label: 'Modelo', value: '11E' },
      { label: 'Año', value: 'N/A' },
      { label: 'Combustible', value: 'ELECTRICO' },
      { label: 'Tamaño', value: 'N/A' },
      { label: 'Area', value: 'N/A' },
      { label: 'Peso unitario', value: 'N/A' },
    ],
  },
  {
    title: 'Valores comerciales',
    fields: [
      { label: 'Precio', value: 'N/A' },
      { label: 'Precio sub alquiler', value: 'N/A' },
      { label: 'Valor reposicion', value: 'N/A' },
      { label: 'Tipo de cobro', value: 'N/A' },
    ],
  },
];

const FUEL_OPTIONS = [
  { value: 'GASOLINA', label: 'GASOLINA' },
  { value: 'DIESEL', label: 'DIESEL' },
  { value: 'ELECTRICO', label: 'ELECTRICO' },
];

const WAREHOUSE_OPTIONS = [{ value: 'rev', label: 'REV' }];

function BlankSlot({ kind }: { kind: 'hero' | 'details' | 'form' | 'location' }) {
  return <div className={`component-lab-placeholder component-lab-placeholder-${kind}`} aria-hidden="true" />;
}

export default function SerializedAssetComponentLab({
  component,
  emptyMovement = false,
}: {
  component: SerializedAssetLabComponent;
  emptyMovement?: boolean;
}) {
  const [brand, setBrand] = useState('BOSCH');
  const [model, setModel] = useState('11E');
  const [year, setYear] = useState<number | ''>('');
  const [fuel, setFuel] = useState('ELECTRICO');
  const [warehouseCurrentId, setWarehouseCurrentId] = useState<string | null>('rev');
  const [active, setActive] = useState(true);

  const resetForm = () => {
    setBrand('BOSCH');
    setModel('11E');
    setYear('');
    setFuel('ELECTRICO');
    setWarehouseCurrentId('rev');
    setActive(true);
  };

  return (
    <Container size="xl" py="xl">
      <div style={{ minHeight: 44 }} aria-hidden="true" />
      <Stack gap="lg">
        {component === 'hero' ? (
          <SerializedAssetHero
            active
            description="BOSCH 11E"
            facts={FACTS}
            imageUrl=""
            location={{ color: 'blue', label: 'REV' }}
          />
        ) : (
          <BlankSlot kind="hero" />
        )}

        {component === 'details' ? <AssetDetailsPanel sections={SECTIONS} /> : <BlankSlot kind="details" />}

        {component === 'edit-form' ? (
          <SerializedAssetEditForm
            active={active}
            brand={brand}
            fuel={fuel}
            fuelOptions={FUEL_OPTIONS}
            imageUploading={false}
            model={model}
            onActiveChange={setActive}
            onBrandChange={setBrand}
            onCancel={resetForm}
            onFuelChange={setFuel}
            onImageUpload={() => undefined}
            onModelChange={setModel}
            onSave={() => undefined}
            onWarehouseChange={setWarehouseCurrentId}
            onYearChange={setYear}
            saving={false}
            warehouseCurrentId={warehouseCurrentId}
            warehouseOptions={WAREHOUSE_OPTIONS}
            worksiteLocationName={null}
            year={year}
          />
        ) : (
          <BlankSlot kind="form" />
        )}

        {component === 'movement-summary' ? (
          <AssetMovementSummary
            movements={emptyMovement ? [] : [
              {
                id: 'movement-1',
                movementType: 'IN',
                quantity: 1,
                createdAt: '2026-08-14T14:30:00.000Z',
                warehouse: { id: 'rev', name: 'REV' },
                customerWorksite: null,
                document: { id: 'document-1', consecutive: 'DV000001', type: 'RETURN' },
              },
            ]}
            warehouseCurrentId={emptyMovement ? null : 'rev'}
            warehouseCurrentName={emptyMovement ? '' : 'REV'}
            worksiteLocationName={null}
          />
        ) : (
          <BlankSlot kind="location" />
        )}
      </Stack>
    </Container>
  );
}
