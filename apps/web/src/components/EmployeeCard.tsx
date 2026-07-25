'use client';

import { useState } from 'react';
import { ActionIcon, Badge, Box, FileButton, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { IconCamera, IconCar, IconFileDescription, IconIdBadge2, IconMail, IconPhone } from '@tabler/icons-react';
import EmployeeAvatar from '@/components/EmployeeAvatar';
import { api, ApiError } from '@/lib/api';

export type EmployeeCardVehicle = {
  id: string;
  plate: string;
  brand?: string | null;
  model?: string | null;
  active?: boolean;
};

export type EmployeeCardAppRole = 'ADMIN' | 'OFFICE' | 'DRIVER' | 'OPERATOR';

export type EmployeeCardRole =
  | 'DRIVER'
  | 'HEAVY_MACHINERY_OPERATOR'
  | 'MACHINIST'
  | 'OFFICE'
  | 'MANAGER'
  | 'OPERATIONS_MANAGER'
  | 'MECHANIC'
  | 'WAREHOUSE_KEEPER'
  | 'OTHER';

export type EmployeeCardRecord = {
  id: string;
  name: string;
  lastName: string;
  role: EmployeeCardRole;
  phone: string | null;
  email: string | null;
  documentId: string | null;
  active: boolean;
  vehicles: EmployeeCardVehicle[];
  user: {
    id: string;
    email: string;
    role: EmployeeCardAppRole;
    active: boolean;
  } | null;
};

const roleLabelByValue: Record<EmployeeCardRole, string> = {
  DRIVER: 'Conductor',
  HEAVY_MACHINERY_OPERATOR: 'Operario maquinaria amarilla',
  MACHINIST: 'Machinero',
  OFFICE: 'Oficina',
  MANAGER: 'Gerente',
  OPERATIONS_MANAGER: 'Jefe operaciones',
  MECHANIC: 'Mecánico',
  WAREHOUSE_KEEPER: 'Bodeguero',
  OTHER: 'Otro',
};

const iconSize14Style = { width: 14, height: 14, minWidth: 14, flexShrink: 0 } as const;

export function getEmployeeCardFullName(employee: Pick<EmployeeCardRecord, 'name' | 'lastName'>) {
  return `${employee.name} ${employee.lastName}`.trim();
}

function getVehicleSummary(vehicles: EmployeeCardVehicle[]) {
  if (!vehicles.length) return 'Sin vehículos';
  return vehicles.map((entry) => entry.plate).join(', ');
}

function EmployeeStatusBadge({ active }: { active: boolean }) {
  return (
    <Badge
      color={active ? 'green' : 'gray'}
      variant="light"
      style={{ minWidth: 76, flexShrink: 0, textAlign: 'center' }}
    >
      {active ? 'Activo' : 'Inactivo'}
    </Badge>
  );
}

export default function EmployeeCard({
  employee,
  onDocuments,
  onIdentityCard,
  identityCardLoading = false,
}: {
  employee: EmployeeCardRecord;
  onDocuments: (employee: EmployeeCardRecord) => void;
  onIdentityCard: (employee: EmployeeCardRecord) => void;
  identityCardLoading?: boolean;
}) {
  const [photoVersion, setPhotoVersion] = useState(0);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const showVehicle = employee.role !== 'OFFICE';

  const uploadProfilePhoto = async (file: File | null) => {
    if (!file) return;

    setUploadingPhoto(true);
    setPhotoError(null);

    const formData = new FormData();
    formData.append('photo', file);

    try {
      await api<{ uploaded: true }>(`/employees/${employee.id}/photo`, {
        method: 'POST',
        body: formData,
      });
      setPhotoVersion((current) => current + 1);
    } catch (error) {
      setPhotoError(
        error instanceof ApiError
          ? `${error.status}: ${error.message}`
          : error instanceof Error
            ? error.message
            : 'No se pudo subir la foto',
      );
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <Paper withBorder radius="lg" p="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Box pos="relative" w={74} h={74}>
            <EmployeeAvatar employee={employee} size={74} version={photoVersion} />
            <FileButton onChange={uploadProfilePhoto} accept="image/png,image/jpeg,image/webp">
              {(props) => (
                <Tooltip label="Cambiar foto">
                  <ActionIcon
                    {...props}
                    aria-label={`Cambiar foto de ${getEmployeeCardFullName(employee)}`}
                    color="blue"
                    loading={uploadingPhoto}
                    radius="xl"
                    size="sm"
                    variant="filled"
                    style={{ position: 'absolute', bottom: 0, right: 0 }}
                  >
                    <IconCamera style={iconSize14Style} />
                  </ActionIcon>
                </Tooltip>
              )}
            </FileButton>
          </Box>
          <EmployeeStatusBadge active={employee.active} />
        </Group>

        {photoError ? (
          <Text size="xs" c="red">
            {photoError}
          </Text>
        ) : null}

        <Stack gap={2}>
          <Text fw={800} size="lg" lh={1.15}>
            {getEmployeeCardFullName(employee)}
          </Text>
          <Text size="sm" c="dimmed">
            {roleLabelByValue[employee.role] ?? employee.role}
          </Text>
          <Text size="xs" c="dimmed">
            DOCUMENTO: {employee.documentId ?? 'SIN REGISTRAR'}
          </Text>
        </Stack>

        <Stack gap={3}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
            Contacto
          </Text>
          <Group gap={6} wrap="nowrap">
            <IconPhone style={iconSize14Style} />
            <Text size="sm" truncate>
              {employee.phone ?? '-'}
            </Text>
          </Group>
          <Group gap={6} wrap="nowrap">
            <IconMail style={iconSize14Style} />
            <Text size="sm" truncate>
              {employee.email ?? 'Sin correo'}
            </Text>
          </Group>
        </Stack>

        {showVehicle ? (
          <Group gap={6} wrap="nowrap">
            <IconCar style={iconSize14Style} />
            <Text size="sm" truncate>
              {getVehicleSummary(employee.vehicles)}
            </Text>
          </Group>
        ) : null}

        <Group justify="flex-end" gap="xs" wrap="nowrap">
          <Tooltip label="Cedula">
            <ActionIcon
              color="gray"
              variant="light"
              aria-label={`Cedula de ${getEmployeeCardFullName(employee)}`}
              onClick={() => onIdentityCard(employee)}
              loading={identityCardLoading}
            >
              <IconIdBadge2 style={iconSize14Style} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Documentos">
            <ActionIcon
              color="blue"
              variant="light"
              aria-label={`Documentos de ${getEmployeeCardFullName(employee)}`}
              onClick={() => onDocuments(employee)}
            >
              <IconFileDescription style={iconSize14Style} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Stack>
    </Paper>
  );
}
