import {
  Badge,
  Button,
  FileButton,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { IconCheck, IconUpload, IconX } from '@tabler/icons-react';

type Option = { value: string; label: string };

type SerializedAssetEditFormProps = {
  active: boolean;
  brand: string;
  fuel: string;
  fuelOptions: Option[];
  imageUploading: boolean;
  model: string;
  onActiveChange: (value: boolean) => void;
  onBrandChange: (value: string) => void;
  onCancel: () => void;
  onFuelChange: (value: string) => void;
  onImageUpload: (file: File | null) => void;
  onModelChange: (value: string) => void;
  onSave: () => void;
  onWarehouseChange: (value: string | null) => void;
  onYearChange: (value: number | '') => void;
  saving: boolean;
  warehouseCurrentId: string | null;
  warehouseOptions: Option[];
  worksiteLocationName: string | null;
  year: number | '';
};

export default function SerializedAssetEditForm({
  active,
  brand,
  fuel,
  fuelOptions,
  imageUploading,
  model,
  onActiveChange,
  onBrandChange,
  onCancel,
  onFuelChange,
  onImageUpload,
  onModelChange,
  onSave,
  onWarehouseChange,
  onYearChange,
  saving,
  warehouseCurrentId,
  warehouseOptions,
  worksiteLocationName,
  year,
}: SerializedAssetEditFormProps) {
  return (
    <Paper withBorder radius="xl" p={{ base: 'md', md: 'xl' }}>
      <Group justify="space-between" align="center" mb="md">
        <div>
          <Text className="ui-text-title" style={{ fontSize: '1rem' }}>
            Datos del equipo
          </Text>
          <Text className="ui-text-body">Informacion tecnica y comercial visible para operacion.</Text>
        </div>
        <Badge color="blue" variant="light">
          Editando
        </Badge>
      </Group>

      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput label="Marca" value={brand} onChange={(event) => onBrandChange(event.currentTarget.value)} />
          <TextInput label="Modelo" value={model} onChange={(event) => onModelChange(event.currentTarget.value)} />
          <NumberInput
            label="Año"
            value={year}
            min={1900}
            max={new Date().getFullYear() + 1}
            onChange={(value) => onYearChange(typeof value === 'number' ? value : '')}
          />
          <Select
            label="Combustible"
            value={fuel || null}
            onChange={(value) => onFuelChange(value ?? '')}
            data={fuelOptions}
            clearable
          />
          <Select
            label="Ubicacion en bodega"
            value={warehouseCurrentId}
            onChange={onWarehouseChange}
            data={warehouseOptions}
            placeholder={worksiteLocationName ?? 'Equipo en obra'}
            clearable
          />
        </SimpleGrid>

        <Paper withBorder radius="lg" p="md" bg="gray.0">
          <Group justify="space-between" align="center" gap="md">
            <div>
              <Text className="ui-text-label">Imagen del equipo</Text>
              <Text className="ui-text-body">PNG, JPG o WEBP.</Text>
            </div>
            <FileButton onChange={onImageUpload} accept="image/png,image/jpeg,image/webp">
              {(props) => (
                <Button {...props} leftSection={<IconUpload size={16} />} loading={imageUploading}>
                  Subir imagen
                </Button>
              )}
            </FileButton>
          </Group>
        </Paper>

        <Group justify="flex-end">
          <Button variant="default" leftSection={<IconX size={16} />} onClick={onCancel}>
            Cancelar
          </Button>
          <Button leftSection={<IconCheck size={16} />} onClick={onSave} loading={saving}>
            Guardar cambios
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
