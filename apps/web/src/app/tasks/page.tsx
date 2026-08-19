'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import {
  IconBrandWhatsapp,
  IconChecklist,
  IconClock,
  IconPackage,
  IconPlus,
  IconSearch,
  IconTargetArrow,
  IconTrash,
  IconUserCheck,
} from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import StatCard from '@/components/dashboard/StatCard';
import DataTableToolbar from '@/components/tables/DataTableToolbar';
import EntityDataTable from '@/components/tables/EntityDataTable';
import type { DataTableColumn } from '@/components/tables/table.types';
import { api } from '@/lib/api';

type TaskStatus = 'OPEN' | 'DOING' | 'DONE';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
type TaskReminderUnit = 'MINUTES' | 'HOURS' | 'DAYS' | 'WEEKS' | 'MONTHS';

type Task = {
  id: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority | null;
  dueDate?: string | null;
  reminderIntervalValue?: number | null;
  reminderIntervalUnit?: TaskReminderUnit | null;
  status?: TaskStatus | null;
  assignedToUserId?: string | null;
  assignedToEmployeeId?: string | null;
  bulkItemName?: string | null;
  assignedToUser?: {
    id: string;
    name: string;
  } | null;
  assignedToEmployee?: {
    id: string;
    name: string;
    active?: boolean;
  } | null;
};

type User = {
  id: string;
  name: string;
  email?: string;
  role?: string;
  phone?: string | null;
};

type Employee = {
  id: string;
  name: string;
  lastName?: string;
  phone?: string | null;
  active?: boolean;
  user?: {
    id: string;
    active: boolean;
  } | null;
};

type Asset = {
  id: string;
  serial?: string | null;
  name?: string | null;
};

type AssigneeOptionValue = `user:${string}` | `employee:${string}`;

const statusOptions = [
  { value: 'OPEN', label: 'Abierta' },
  { value: 'DOING', label: 'En curso' },
  { value: 'DONE', label: 'Hecha' },
];

const priorityOptions = [
  { value: 'LOW', label: 'Baja' },
  { value: 'MEDIUM', label: 'Media' },
  { value: 'HIGH', label: 'Alta' },
];

const reminderUnitOptions = [
  { value: 'MINUTES', label: 'Minutos' },
  { value: 'HOURS', label: 'Horas' },
  { value: 'DAYS', label: 'Días' },
  { value: 'WEEKS', label: 'Semanas' },
  { value: 'MONTHS', label: 'Meses' },
];

const statusFilterOptions = [{ value: 'ALL', label: 'Todas' }, ...statusOptions];

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-CO');
}

function priorityColor(priority?: string | null) {
  if (priority === 'HIGH') return 'red';
  if (priority === 'MEDIUM') return 'yellow';
  return 'gray';
}

function formatPriorityLabel(priority?: TaskPriority | null) {
  if (priority === 'HIGH') return 'ALTA';
  if (priority === 'LOW') return 'BAJA';
  return 'MEDIA';
}

function getEmployeeName(employee: Pick<Employee, 'name' | 'lastName'>) {
  return `${employee.name} ${employee.lastName ?? ''}`.trim();
}

function getTaskAssigneeName(task: Task) {
  return task.assignedToUser?.name || task.assignedToEmployee?.name || '-';
}

function getTaskAssigneeValue(task: Task): AssigneeOptionValue | null {
  if (task.assignedToUserId) return `user:${task.assignedToUserId}`;
  if (task.assignedToEmployeeId) return `employee:${task.assignedToEmployeeId}`;
  return null;
}

function parseAssigneeValue(value: string | null): {
  assignedToUserId: string | null;
  assignedToEmployeeId: string | null;
} {
  if (!value) return { assignedToUserId: null, assignedToEmployeeId: null };
  if (value.startsWith('user:')) {
    return {
      assignedToUserId: value.slice('user:'.length),
      assignedToEmployeeId: null,
    };
  }
  if (value.startsWith('employee:')) {
    return {
      assignedToUserId: null,
      assignedToEmployeeId: value.slice('employee:'.length),
    };
  }
  return { assignedToUserId: null, assignedToEmployeeId: null };
}

function getDueState(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - now.getTime()) / 86400000);

  if (diffDays < 0) return { tone: 'red' as const, label: 'Vencida' };
  if (diffDays <= 2) return { tone: 'yellow' as const, label: 'Próxima' };
  return { tone: 'gray' as const, label: 'Programada' };
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TaskStatus>('ALL');

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [reminderIntervalValue, setReminderIntervalValue] = useState<number | ''>(1);
  const [reminderIntervalUnit, setReminderIntervalUnit] =
    useState<TaskReminderUnit>('DAYS');
  const [assignedToUserId, setAssignedToUserId] = useState<string | null>(null);
  const [assignedToEmployeeId, setAssignedToEmployeeId] = useState<string | null>(null);

  const [users, setUsers] = useState<User[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);

  const [assetsModalOpen, setAssetsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState(false);
  const [taskAssets, setTaskAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetSearchMode, setAssetSearchMode] = useState<'serial' | 'search'>('serial');
  const [assetQuery, setAssetQuery] = useState('');
  const [assetResults, setAssetResults] = useState<Asset[]>([]);
  const [assetSearching, setAssetSearching] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadAssignees = async () => {
      setAssigneesLoading(true);
      try {
        const [usersData, employeesData] = await Promise.all([api<User[]>('/users?active=true'), api<Employee[]>('/employees')]);
        if (mounted) {
          setUsers(usersData);
          setEmployees(employeesData.filter((employee) => employee.active !== false));
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'No se pudieron cargar asignados');
        }
      } finally {
        if (mounted) setAssigneesLoading(false);
      }
    };
    loadAssignees();
    return () => {
      mounted = false;
    };
  }, []);

  const assigneeOptions = useMemo(
    () => [
      {
        group: 'Usuarios activos',
        items: users.map((user) => ({
          value: `user:${user.id}`,
          label: `${user.name}${user.email ? ` · ${user.email}` : ''}${user.phone ? ' · WhatsApp' : ' · Sin teléfono'}`,
        })),
      },
      {
        group: 'Empleados',
        items: employees.map((employee) => ({
          value: `employee:${employee.id}`,
          label: `${getEmployeeName(employee)}${employee.phone ? ' · WhatsApp' : ' · Sin teléfono'}${employee.user?.active ? '' : ' · sin recordatorios de vencimiento'}`,
        })),
      },
    ],
    [employees, users],
  );

  useEffect(() => {
    let mounted = true;
    const loadTasks = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api<Task[]>('/tasks');
        if (mounted) setTasks(data);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'No se pudieron cargar pendientes');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadTasks();
    return () => {
      mounted = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const openCount = tasks.filter((task) => (task.status ?? 'OPEN') === 'OPEN').length;
    const doingCount = tasks.filter((task) => task.status === 'DOING').length;
    const doneCount = tasks.filter((task) => task.status === 'DONE').length;
    const assignedCount = tasks.filter((task) => task.assignedToUserId || task.assignedToEmployeeId).length;
    const dueSoonCount = tasks.filter((task) => {
      if (!task.dueDate || task.status === 'DONE') return false;
      const date = new Date(task.dueDate);
      if (Number.isNaN(date.getTime())) return false;
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      date.setHours(0, 0, 0, 0);
      const diffDays = Math.round((date.getTime() - now.getTime()) / 86400000);
      return diffDays >= 0 && diffDays <= 2;
    }).length;
    return {
      total: tasks.length,
      openCount,
      doingCount,
      doneCount,
      assignedCount,
      dueSoonCount,
    };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('es');
    return tasks.filter((task) => {
      if (statusFilter !== 'ALL' && (task.status ?? 'OPEN') !== statusFilter) return false;
      if (!normalizedSearch) return true;
      const searchableText = [task.title, task.description, task.bulkItemName, getTaskAssigneeName(task)].filter(Boolean).join(' ').toLocaleLowerCase('es');
      return searchableText.includes(normalizedSearch);
    });
  }, [search, statusFilter, tasks]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPriority('MEDIUM');
    setDueDate('');
    setReminderIntervalValue(1);
    setReminderIntervalUnit('DAYS');
    setAssignedToUserId(null);
    setAssignedToEmployeeId(null);
  };

  const openCreate = () => {
    resetForm();
    setCreating(true);
  };

  const closeCreate = () => setCreating(false);

  const handleCreate = async () => {
    if (!title.trim() || reminderIntervalValue === '') return;
    setSaving(true);
    setError(null);
    try {
      await api('/tasks', {
        method: 'POST',
        json: {
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          dueDate: dueDate || undefined,
          reminderIntervalValue,
          reminderIntervalUnit,
          assignedToUserId: assignedToUserId || undefined,
          assignedToEmployeeId: assignedToEmployeeId || undefined,
        },
      });
      closeCreate();
      resetForm();
      const data = await api<Task[]>('/tasks');
      setTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el pendiente');
    } finally {
      setSaving(false);
    }
  };

  const updateTask = async (id: string, patch: Partial<Task>) => {
    let previous: Task[] = [];
    setTasks((current) => {
      previous = current;
      return current.map((task) => {
        if (task.id !== id) return task;
        const next = { ...task, ...patch };
        if (patch.assignedToUserId === null) {
          next.assignedToUser = null;
        } else if (patch.assignedToUserId) {
          const match = users.find((user) => user.id === patch.assignedToUserId);
          if (match) next.assignedToUser = match;
        }
        if (patch.assignedToEmployeeId === null) {
          next.assignedToEmployee = null;
        } else if (patch.assignedToEmployeeId) {
          const match = employees.find((employee) => employee.id === patch.assignedToEmployeeId);
          if (match)
            next.assignedToEmployee = {
              id: match.id,
              name: getEmployeeName(match),
              active: match.active,
            };
        }
        return next;
      });
    });
    try {
      await api(`/tasks/${id}`, { method: 'PATCH', json: patch });
    } catch (err) {
      setTasks(previous);
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el pendiente');
    }
  };

  const openAssetsModal = async (task: Task) => {
    setSelectedTask(task);
    setAssetsModalOpen(true);
    setAssetQuery('');
    setAssetResults([]);
    await loadTaskAssets(task.id);
  };

  const closeAssetsModal = () => {
    setAssetsModalOpen(false);
    setSelectedTask(null);
    setTaskAssets([]);
    setAssetResults([]);
    setAssetQuery('');
  };

  const loadTaskAssets = async (taskId: string) => {
    setAssetsLoading(true);
    try {
      const data = await api<Asset[]>(`/tasks/${taskId}/assets`);
      setTaskAssets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar activos');
    } finally {
      setAssetsLoading(false);
    }
  };

  const searchAssets = async () => {
    if (!assetQuery.trim()) return;
    setAssetSearching(true);
    try {
      const param = assetSearchMode === 'serial' ? 'serial' : 'search';
      const data = await api<Asset[]>(`/assets?${param}=${encodeURIComponent(assetQuery.trim())}`);
      setAssetResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron buscar activos');
    } finally {
      setAssetSearching(false);
    }
  };

  const addAssetToTask = async (assetId: string) => {
    if (!selectedTask) return;
    try {
      await api(`/tasks/${selectedTask.id}/assets`, {
        method: 'POST',
        json: { assetId },
      });
      await loadTaskAssets(selectedTask.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo vincular el activo');
    }
  };

  const removeAssetFromTask = async (assetId: string) => {
    if (!selectedTask) return;
    try {
      await api(`/tasks/${selectedTask.id}/assets/${assetId}`, {
        method: 'DELETE',
      });
      await loadTaskAssets(selectedTask.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo quitar el activo');
    }
  };

  const deleteTask = async () => {
    if (!taskToDelete) return;
    setDeletingTask(true);
    setError(null);
    try {
      await api(`/tasks/${taskToDelete.id}`, { method: 'DELETE' });
      setTasks((current) => current.filter((task) => task.id !== taskToDelete.id));
      if (selectedTask?.id === taskToDelete.id) closeAssetsModal();
      setTaskToDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el pendiente');
    } finally {
      setDeletingTask(false);
    }
  };

  const taskColumns: DataTableColumn<Task>[] = [
    {
      id: 'task',
      header: 'Tarea',
      ariaLabel: 'tarea',
      width: '25%',
      sortValue: (task) => task.title,
      mobile: { priority: 'primary' },
      cell: (task) => (
        <Stack gap={4}>
          <Group gap="xs">
            <Text fw={600}>{task.title}</Text>
            {task.bulkItemName ? (
              <Badge variant="light" color="grape" leftSection={<IconPackage size={12} />}>
                {task.bulkItemName}
              </Badge>
            ) : null}
          </Group>
          {task.description ? <Text size="xs" c="dimmed">{task.description}</Text> : null}
        </Stack>
      ),
    },
    {
      id: 'priority',
      header: 'Prioridad',
      ariaLabel: 'prioridad',
      width: '12%',
      sortValue: (task) => task.priority ?? 'MEDIUM',
      mobile: { label: 'Prioridad', priority: 'detail' },
      cell: (task) => (
        <Select
          aria-label={`Prioridad de ${task.title}`}
          value={task.priority ?? 'MEDIUM'}
          onChange={(value) => updateTask(task.id, { priority: (value as TaskPriority) || 'MEDIUM' })}
          data={priorityOptions}
          size="xs"
          allowDeselect={false}
        />
      ),
    },
    {
      id: 'dueDate',
      header: 'Vence',
      ariaLabel: 'fecha de vencimiento',
      width: '12%',
      sortValue: (task) => task.dueDate ? new Date(task.dueDate) : null,
      mobile: { label: 'Vence', priority: 'detail' },
      cell: (task) => {
        const dueState = getDueState(task.dueDate);
        return (
          <Stack gap={4}>
            <Text size="sm">{formatDate(task.dueDate)}</Text>
            {dueState ? (
              <Badge color={dueState.tone} variant="light" w="fit-content">{dueState.label}</Badge>
            ) : null}
          </Stack>
        );
      },
    },
    {
      id: 'assignee',
      header: 'Responsable',
      ariaLabel: 'responsable',
      width: '20%',
      sortValue: getTaskAssigneeName,
      mobile: { label: 'Responsable', priority: 'detail' },
      cell: (task) => (
        <Select
          aria-label={`Responsable de ${task.title}`}
          value={getTaskAssigneeValue(task)}
          onChange={(value) => updateTask(task.id, parseAssigneeValue(value))}
          data={assigneeOptions}
          size="xs"
          placeholder="-"
          searchable
          clearable
          disabled={assigneesLoading}
        />
      ),
    },
    {
      id: 'status',
      header: 'Estado',
      ariaLabel: 'estado',
      width: '12%',
      sortValue: (task) => task.status ?? 'OPEN',
      mobile: { label: 'Estado', priority: 'detail' },
      cell: (task) => (
        <Select
          aria-label={`Estado de ${task.title}`}
          value={task.status ?? 'OPEN'}
          onChange={(value) => updateTask(task.id, { status: (value as TaskStatus) || 'OPEN' })}
          data={statusOptions}
          size="xs"
          allowDeselect={false}
        />
      ),
    },
  ];

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <PageHeaderCard
          title="Pendientes"
          description="Asigna responsables, controla vencimientos y da seguimiento al trabajo del equipo."
          icon={<IconChecklist size={20} />}
          iconColor="yellow"
          accentColor="rgba(245,158,11,0.12)"
          aside={
            <Button onClick={openCreate} leftSection={<IconPlus size={16} />}>
              Nuevo pendiente
            </Button>
          }
        >
          <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="md">
            <StatCard label="Total" value={String(metrics.total)} hint="Tareas visibles" color="yellow" icon={<IconChecklist size={20} />} />
            <StatCard label="Abiertas" value={String(metrics.openCount)} hint="Pendientes por iniciar" color="gray" icon={<IconClock size={20} />} />
            <StatCard label="En curso" value={String(metrics.doingCount)} hint="Actualmente trabajando" color="blue" icon={<IconTargetArrow size={20} />} />
            <StatCard
              label="Por vencer"
              value={String(metrics.dueSoonCount)}
              hint={`${metrics.assignedCount} asignadas · ${metrics.doneCount} hechas`}
              color="green"
              icon={<IconUserCheck size={20} />}
            />
          </SimpleGrid>
        </PageHeaderCard>

        {error ? (
          <Alert color="red" variant="light" title="No se pudo completar la operacion">
            {error}
          </Alert>
        ) : null}

        <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
          <Stack gap="md">
            <DataTableToolbar
              title="Lista de pendientes"
              description={`${filteredTasks.length} de ${tasks.length} pendiente${tasks.length === 1 ? '' : 's'}.`}
              mb={0}
            >
              <Badge color="gray" variant="light">
                Tablero general
              </Badge>
            </DataTableToolbar>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput
                aria-label="Buscar pendientes"
                placeholder="Buscar por tarea, responsable o activo"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                leftSection={<IconSearch size={16} />}
              />
              <Select
                aria-label="Filtrar por estado"
                value={statusFilter}
                onChange={(value) => setStatusFilter((value as 'ALL' | TaskStatus) ?? 'ALL')}
                data={statusFilterOptions}
                allowDeselect={false}
              />
            </SimpleGrid>

            <EntityDataTable
              rows={filteredTasks}
              columns={taskColumns}
              getRowId={(task) => task.id}
              loading={loading}
              tableMinWidth={820}
              emptyState={{
                title: 'No hay pendientes para los filtros actuales',
                description: 'Cambia el estado, limpia la búsqueda o crea un nuevo pendiente.',
                icon: <IconChecklist size={24} />,
                action: search || statusFilter !== 'ALL' ? (
                  <Button
                    variant="light"
                    onClick={() => {
                      setSearch('');
                      setStatusFilter('ALL');
                    }}
                  >
                    Limpiar filtros
                  </Button>
                ) : null,
              }}
              actions={(task) => [
                {
                  key: 'assets',
                  label: `Gestionar activos de ${task.title}`,
                  icon: <IconPackage size={16} />,
                  color: 'blue',
                  onClick: () => openAssetsModal(task),
                },
                {
                  key: 'delete',
                  label: `Eliminar ${task.title}`,
                  icon: <IconTrash size={16} />,
                  color: 'red',
                  onClick: () => setTaskToDelete(task),
                },
              ]}
            />
          </Stack>
        </Paper>
      </Stack>

      <Modal opened={creating} onClose={closeCreate} title="Nuevo pendiente" centered size="lg">
        <Stack gap="lg">
          <Paper withBorder radius="lg" p="md" bg="yellow.0">
            <Group justify="space-between" align="flex-start">
              <Stack gap={2}>
                <Text fw={700}>Alta de pendiente</Text>
                <Text size="sm" c="dimmed">
                  Registra una tarea, define su prioridad y asígnala a la persona responsable.
                </Text>
              </Stack>
              <Badge color={priorityColor(priority)} variant="light">
                Prioridad {formatPriorityLabel(priority)}
              </Badge>
            </Group>
          </Paper>

          <Paper withBorder radius="lg" p="md">
            <Stack gap="md">
              <div>
                <Text fw={700}>Información general</Text>
                <Text size="sm" c="dimmed">
                  Describe claramente qué se necesita y cuándo debe estar listo.
                </Text>
              </div>
              <TextInput label="Título" value={title} onChange={(event) => setTitle(event.currentTarget.value)} required />
              <Textarea label="Descripción" value={description} onChange={(event) => setDescription(event.currentTarget.value)} minRows={3} />
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <Select label="Prioridad" value={priority} onChange={(value) => setPriority((value as TaskPriority) || 'MEDIUM')} data={priorityOptions} />
                <TextInput label="Vence" type="date" value={dueDate} onChange={(event) => setDueDate(event.currentTarget.value)} />
              </SimpleGrid>
              <div>
                <Text fw={600} size="sm">Frecuencia del recordatorio por WhatsApp</Text>
                <Text size="xs" c="dimmed">
                  Mientras el pendiente siga abierto, se enviará un recordatorio con este intervalo.
                </Text>
              </div>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <NumberInput
                  label="Recordar cada"
                  value={reminderIntervalValue}
                  onChange={(value) =>
                    setReminderIntervalValue(typeof value === 'number' ? value : '')
                  }
                  min={1}
                  allowDecimal={false}
                  required
                />
                <Select
                  label="Unidad"
                  value={reminderIntervalUnit}
                  onChange={(value) =>
                    setReminderIntervalUnit((value as TaskReminderUnit) || 'DAYS')
                  }
                  data={reminderUnitOptions}
                  allowDeselect={false}
                />
              </SimpleGrid>
            </Stack>
          </Paper>

          <Paper withBorder radius="lg" p="md">
            <Stack gap="md">
              <div>
                <Text fw={700}>Contexto operativo</Text>
                <Text size="sm" c="dimmed">
                  Selecciona quién debe atender este pendiente.
                </Text>
              </div>
              <Select
                label="Responsable"
                value={assignedToUserId ? `user:${assignedToUserId}` : assignedToEmployeeId ? `employee:${assignedToEmployeeId}` : null}
                onChange={(value) => {
                  const assignee = parseAssigneeValue(value);
                  setAssignedToUserId(assignee.assignedToUserId);
                  setAssignedToEmployeeId(assignee.assignedToEmployeeId);
                }}
                data={assigneeOptions}
                searchable
                clearable
                disabled={assigneesLoading}
                placeholder={assigneesLoading ? 'Cargando...' : 'Seleccionar'}
              />
              <Group gap="xs" wrap="nowrap" align="flex-start">
                <IconBrandWhatsapp size={17} color="var(--mantine-color-green-6)" />
                <Text size="xs" c="dimmed">
                  Si el responsable tiene teléfono registrado, recibirá la asignación por WhatsApp.
                </Text>
              </Group>
            </Stack>
          </Paper>

          <Group justify="flex-end" className="mobile-actions">
            <Button variant="light" onClick={closeCreate} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              loading={saving}
              disabled={!title.trim() || reminderIntervalValue === ''}
            >
              Guardar
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={Boolean(taskToDelete)}
        onClose={() => setTaskToDelete(null)}
        title="Eliminar pendiente"
        centered
        size="sm"
        closeOnClickOutside={!deletingTask}
        closeOnEscape={!deletingTask}
      >
        <Stack gap="lg">
          <div>
            <Text fw={700}>¿Eliminar “{taskToDelete?.title}”?</Text>
            <Text size="sm" c="dimmed" mt={4}>
              También se quitarán los activos vinculados a esta tarea. Esta acción no se puede deshacer.
            </Text>
          </div>
          <Group justify="flex-end" className="mobile-actions">
            <Button variant="default" onClick={() => setTaskToDelete(null)} disabled={deletingTask}>
              Cancelar
            </Button>
            <Button color="red" onClick={() => void deleteTask()} loading={deletingTask}>
              Eliminar pendiente
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={assetsModalOpen} onClose={closeAssetsModal} title={selectedTask ? `Seriales - ${selectedTask.title}` : 'Seriales'} centered size="lg">
        <Stack gap="md">
          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <div>
                  <Text fw={700}>Activos vinculados</Text>
                  <Text size="sm" c="dimmed">
                    Equipos relacionados con esta tarea para facilitar su seguimiento.
                  </Text>
                </div>
                <Badge color="gray" variant="light">
                  {taskAssets.length} activo{taskAssets.length === 1 ? '' : 's'}
                </Badge>
              </Group>
              {assetsLoading ? (
                <Center py="sm">
                  <Loader size="sm" />
                </Center>
              ) : (
                <Stack gap="sm">
                  {taskAssets.map((asset) => (
                    <Paper key={asset.id} withBorder radius="md" p="sm" bg="gray.0">
                      <Group justify="space-between" align="center" wrap="nowrap">
                        <Text size="sm" fw={600}>
                          {asset.serial || asset.name || asset.id}
                        </Text>
                        <ActionIcon variant="light" color="red" aria-label="Quitar activo" onClick={() => removeAssetFromTask(asset.id)}>
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Paper>
                  ))}
                  {!taskAssets.length && (
                    <Text size="sm" c="dimmed">
                      Sin activos vinculados.
                    </Text>
                  )}
                </Stack>
              )}
            </Stack>
          </Paper>

          <Paper withBorder radius="md" p="md">
            <Stack gap="md">
              <div>
                <Text fw={700}>Buscar activo</Text>
                <Text size="sm" c="dimmed">
                  Busca por serial o nombre y agregalo al pendiente si pertenece a la obra.
                </Text>
              </div>
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                <Select
                  label="Modo"
                  value={assetSearchMode}
                  onChange={(value) => setAssetSearchMode((value as 'serial' | 'search') || 'serial')}
                  data={[
                    { value: 'serial', label: 'SERIAL' },
                    { value: 'search', label: 'NOMBRE' },
                  ]}
                />
                <TextInput label="Buscar" value={assetQuery} onChange={(event) => setAssetQuery(event.currentTarget.value)} />
                <Button mt={{ base: 0, sm: 25 }} leftSection={<IconSearch size={14} />} onClick={searchAssets} loading={assetSearching}>
                  Buscar
                </Button>
              </SimpleGrid>
              <Stack gap="sm">
                {assetResults.map((asset) => (
                  <Paper key={asset.id} withBorder radius="md" p="sm" bg="gray.0">
                    <Group justify="space-between" align="center" wrap="nowrap">
                      <Text size="sm" fw={600}>
                        {asset.serial || asset.name || asset.id}
                      </Text>
                      <Button size="xs" variant="light" onClick={() => addAssetToTask(asset.id)}>
                        Agregar
                      </Button>
                    </Group>
                  </Paper>
                ))}
                {!assetResults.length && (
                  <Text size="sm" c="dimmed">
                    Sin resultados.
                  </Text>
                )}
              </Stack>
            </Stack>
          </Paper>
        </Stack>
      </Modal>
    </Container>
  );
}
