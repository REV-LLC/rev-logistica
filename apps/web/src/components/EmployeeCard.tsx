'use client';

import { ActionIcon, Badge, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import {
  IconCar,
  IconEye,
  IconFileDescription,
  IconIdBadge2,
  IconMail,
  IconPencil,
  IconPhone,
} from '@tabler/icons-react';
import EmployeePhotoControl from '@/components/EmployeePhotoControl';

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

export const employeeCardRoleLabelByValue: Record<EmployeeCardRole, string> = {
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
  onDetails,
  onEdit,
  onPhotoPreview,
  identityCardLoading = false,
}: {
  employee: EmployeeCardRecord;
  onDocuments: (employee: EmployeeCardRecord) => void;
  onIdentityCard: (employee: EmployeeCardRecord) => void;
  onDetails: (employee: EmployeeCardRecord) => void;
  onEdit: (employee: EmployeeCardRecord) => void;
  onPhotoPreview: (employee: EmployeeCardRecord) => void;
  identityCardLoading?: boolean;
}) {
  const showVehicle = employee.role !== 'OFFICE';

  return (
    <Paper withBorder radius="lg" p="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <EmployeePhotoControl
            employee={employee}
            size={74}
            editable
            onPreview={() => onPhotoPreview(employee)}
          />
          <EmployeeStatusBadge active={employee.active} />
        </Group>

        <Stack gap={2}>
          <Text fw={800} size="lg" lh={1.15}>
            {getEmployeeCardFullName(employee)}
          </Text>
          <Text size="sm" c="dimmed">
            {employeeCardRoleLabelByValue[employee.role] ?? employee.role}
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
          <ActionIcon
            color="blue"
            variant="light"
            title="Editar empleado"
            aria-label={`Editar ${getEmployeeCardFullName(employee)}`}
            onClick={() => onEdit(employee)}
          >
            <IconPencil style={iconSize14Style} />
          </ActionIcon>
          <Tooltip label="Ver información completa">
            <ActionIcon
              color="blue"
              variant="filled"
              aria-label={`Ver información de ${getEmployeeCardFullName(employee)}`}
              onClick={() => onDetails(employee)}
            >
              <IconEye style={iconSize14Style} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Stack>
    </Paper>
  );
}
