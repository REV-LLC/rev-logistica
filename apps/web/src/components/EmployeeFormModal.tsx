'use client';

import type { ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  MultiSelect,
  PasswordInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconBriefcase2,
  IconCar,
  IconIdBadge2,
  IconMail,
  IconPhone,
  IconShieldLock,
  IconUserPlus,
} from '@tabler/icons-react';

export type VehicleOption = {
  id: string;
  plate: string;
  brand?: string | null;
  model?: string | null;
  active?: boolean;
};

export type RoleValue =
  | 'DRIVER'
  | 'HEAVY_MACHINERY_OPERATOR'
  | 'MACHINIST'
  | 'OFFICE'
  | 'MANAGER'
  | 'OPERATIONS_MANAGER'
  | 'MECHANIC'
  | 'WAREHOUSE_KEEPER'
  | 'OTHER';

export type AppRoleValue = 'ADMIN' | 'OFFICE' | 'DRIVER';

export type EmployeeForm = {
  name: string;
  lastName: string;
  role: RoleValue;
  phone: string;
  email: string;
  documentId: string;
  active: boolean;
  vehicleIds: string[];
  loginEnabled: boolean;
  loginEmail: string;
  loginPassword: string;
  loginRole: AppRoleValue;
  loginActive: boolean;
};

export type EmployeeFormSummary = {
  name: string;
  lastName: string;
  role: RoleValue;
  active: boolean;
};

export const emptyEmployeeForm: EmployeeForm = {
  name: '',
  lastName: '',
  role: 'DRIVER',
  phone: '',
  email: '',
  documentId: '',
  active: true,
  vehicleIds: [],
  loginEnabled: false,
  loginEmail: '',
  loginPassword: '',
  loginRole: 'DRIVER',
  loginActive: true,
};

export const roleOptions = [
  { value: 'DRIVER', label: 'Conductor' },
  { value: 'HEAVY_MACHINERY_OPERATOR', label: 'Operario maquinaria amarilla' },
  { value: 'MACHINIST', label: 'Machinero' },
  { value: 'OFFICE', label: 'Oficina' },
  { value: 'MANAGER', label: 'Gerente' },
  { value: 'OPERATIONS_MANAGER', label: 'Jefe operaciones' },
  { value: 'MECHANIC', label: 'Mecánico' },
  { value: 'WAREHOUSE_KEEPER', label: 'Bodeguero' },
  { value: 'OTHER', label: 'Otro' },
];

export const roleLabelByValue: Record<RoleValue, string> = {
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

export const appRoleOptions = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'OFFICE', label: 'Oficina' },
  { value: 'DRIVER', label: 'Conductor' },
];

export const appRoleLabelByValue: Record<AppRoleValue, string> = {
  ADMIN: 'Admin',
  OFFICE: 'Oficina',
  DRIVER: 'Conductor',
};

export function toUppercaseInput(value?: string | null) {
  return (value ?? '').toUpperCase();
}

function getEmployeeSummaryName(employee: EmployeeFormSummary) {
  return `${employee.name} ${employee.lastName}`.trim();
}

function FormSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Paper
      withBorder
      radius="lg"
      p="md"
      style={{ borderColor: 'rgba(15, 23, 42, 0.08)', background: '#ffffff' }}
    >
      <Stack gap="md">
        <Group gap="sm" align="flex-start" wrap="nowrap">
          <ThemeIcon color="blue" variant="light" radius="xl" size={34}>
            {icon}
          </ThemeIcon>
          <Box>
            <Text fw={800} lh={1.2}>
              {title}
            </Text>
            <Text size="sm" c="dimmed" lh={1.35}>
              {description}
            </Text>
          </Box>
        </Group>
        {children}
      </Stack>
    </Paper>
  );
}

type EmployeeFormModalProps = {
  opened: boolean;
  mode: 'create' | 'edit';
  form: EmployeeForm;
  vehicles: VehicleOption[];
  saving: boolean;
  error?: string | null;
  editingEmployee?: EmployeeFormSummary | null;
  onClose: () => void;
  onSave: () => void;
  onChange: (updater: (previous: EmployeeForm) => EmployeeForm) => void;
};

export default function EmployeeFormModal({
  opened,
  mode,
  form,
  vehicles,
  saving,
  error,
  editingEmployee,
  onClose,
  onSave,
  onChange,
}: EmployeeFormModalProps) {
  const isEditing = mode === 'edit';
  const title = isEditing ? 'Editar empleado' : 'Nuevo empleado';
  const subtitle = isEditing
    ? 'Actualiza el perfil, las asignaciones y el acceso del colaborador.'
    : 'Registra el perfil operativo y decide si tendrá acceso a la app.';

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ThemeIcon color="blue" variant="light" radius="xl" size={40}>
            <IconUserPlus size={20} />
          </ThemeIcon>
          <Box>
            <Text fw={900} size="lg" lh={1.15}>
              {title}
            </Text>
            <Text size="sm" c="dimmed" lh={1.3}>
              {subtitle}
            </Text>
          </Box>
        </Group>
      }
      centered
      size="xl"
      radius="lg"
      styles={{
        header: { padding: '20px 22px 12px' },
        body: { padding: '0 22px 22px' },
        content: { overflow: 'hidden' },
      }}
    >
      <Stack gap="md">
        <Divider />

        {error ? (
          <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />}>
            {error}
          </Alert>
        ) : null}

        {editingEmployee ? (
          <Paper
            withBorder
            radius="lg"
            p="md"
            style={{
              borderColor: 'rgba(37, 99, 235, 0.16)',
              background:
                'linear-gradient(135deg, rgba(239,246,255,0.98) 0%, rgba(248,250,252,0.98) 100%)',
            }}
          >
            <Group justify="space-between" align="center" gap="sm">
              <Box>
                <Text fw={800}>{getEmployeeSummaryName(editingEmployee)}</Text>
                <Text size="sm" c="dimmed">
                  {roleLabelByValue[editingEmployee.role] ?? editingEmployee.role}
                </Text>
              </Box>
              <Switch
                checked={form.active}
                label="Empleado activo"
                onChange={(event) =>
                  onChange((previous) => ({ ...previous, active: event.currentTarget.checked }))
                }
              />
            </Group>
          </Paper>
        ) : null}

        <FormSection
          icon={<IconIdBadge2 size={18} />}
          title="Perfil del empleado"
          description="Datos básicos para identificar al colaborador en el sistema."
        >
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput
              label="Nombres"
              placeholder="Nombres"
              value={form.name}
              onChange={(event) => {
                const value = toUppercaseInput(event.currentTarget.value);
                onChange((previous) => ({ ...previous, name: value }));
              }}
              required
            />
            <TextInput
              label="Apellidos"
              placeholder="Apellidos"
              value={form.lastName}
              onChange={(event) => {
                const value = toUppercaseInput(event.currentTarget.value);
                onChange((previous) => ({ ...previous, lastName: value }));
              }}
              required
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Select
              label="Rol"
              value={form.role}
              onChange={(value) =>
                onChange((previous) => ({ ...previous, role: (value as RoleValue) ?? 'DRIVER' }))
              }
              data={roleOptions}
              allowDeselect={false}
              required
            />
            <TextInput
              label="Documento"
              placeholder="Documento o identificación"
              value={form.documentId}
              onChange={(event) => {
                const value = toUppercaseInput(event.currentTarget.value);
                onChange((previous) => ({ ...previous, documentId: value }));
              }}
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput
              leftSection={<IconPhone size={16} />}
              label="Teléfono"
              placeholder="Número de contacto"
              value={form.phone}
              onChange={(event) => {
                const value = event.currentTarget.value;
                onChange((previous) => ({ ...previous, phone: value }));
              }}
            />
            <TextInput
              leftSection={<IconMail size={16} />}
              label="Correo"
              placeholder="Correo de contacto"
              value={form.email}
              onChange={(event) => {
                const value = event.currentTarget.value;
                onChange((previous) => ({ ...previous, email: value }));
              }}
            />
          </SimpleGrid>

          {!editingEmployee ? (
            <Switch
              checked={form.active}
              label="Empleado activo"
              onChange={(event) =>
                onChange((previous) => ({ ...previous, active: event.currentTarget.checked }))
              }
            />
          ) : null}
        </FormSection>

        <FormSection
          icon={<IconCar size={18} />}
          title="Asignación operativa"
          description="Vincula los vehículos asignados actualmente a este empleado."
        >
          <MultiSelect
            label="Vehículos asignados"
            placeholder="Selecciona uno o más vehículos"
            value={form.vehicleIds}
            onChange={(value) => onChange((previous) => ({ ...previous, vehicleIds: value }))}
            data={vehicles.map((vehicle) => ({
              value: vehicle.id,
              label: `${vehicle.plate}${vehicle.brand ? ` · ${vehicle.brand}` : ''}${
                vehicle.model ? ` ${vehicle.model}` : ''
              }`,
            }))}
            searchable
            nothingFoundMessage="Sin resultados"
          />
        </FormSection>

        <FormSection
          icon={<IconShieldLock size={18} />}
          title="Acceso a la app"
          description="Controla si el empleado puede ingresar al sistema y con qué rol operativo."
        >
          <Switch
            checked={form.loginEnabled}
            label="Crear o mantener acceso para este empleado"
            onChange={(event) =>
              onChange((previous) => ({ ...previous, loginEnabled: event.currentTarget.checked }))
            }
          />

          {form.loginEnabled ? (
            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  leftSection={<IconMail size={16} />}
                  label="Correo de acceso"
                  placeholder="usuario@empresa.com"
                  value={form.loginEmail}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    onChange((previous) => ({ ...previous, loginEmail: value }));
                  }}
                  required
                />
                <Select
                  leftSection={<IconBriefcase2 size={16} />}
                  label="Rol en la app"
                  value={form.loginRole}
                  onChange={(value) =>
                    onChange((previous) => ({
                      ...previous,
                      loginRole: (value as AppRoleValue) ?? 'DRIVER',
                    }))
                  }
                  data={appRoleOptions}
                  allowDeselect={false}
                />
              </SimpleGrid>

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <PasswordInput
                  label={isEditing ? 'Nueva contraseña (opcional)' : 'Contraseña'}
                  placeholder={isEditing ? 'Déjala vacía para mantener la actual' : 'Contraseña inicial'}
                  value={form.loginPassword}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    onChange((previous) => ({ ...previous, loginPassword: value }));
                  }}
                />
                <Switch
                  mt={{ base: 0, sm: 'xl' }}
                  checked={form.loginActive}
                  label="Usuario activo"
                  onChange={(event) =>
                    onChange((previous) => ({
                      ...previous,
                      loginActive: event.currentTarget.checked,
                    }))
                  }
                />
              </SimpleGrid>
            </Stack>
          ) : (
            <Paper radius="md" p="sm" bg="gray.0">
              <Text size="sm" c="dimmed">
                Este empleado no tendrá acceso al sistema. Sus datos operativos seguirán disponibles.
              </Text>
            </Paper>
          )}
        </FormSection>

        <Group justify="flex-end" className="mobile-actions" pt="xs">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={saving} onClick={onSave}>
            {isEditing ? 'Guardar cambios' : 'Crear empleado'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
