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
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
} from '@mantine/core';
import {
  IconCalendarEvent,
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
import { api } from '@/lib/api';

type TaskStatus = 'OPEN' | 'DOING' | 'DONE';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

type Task = {
  id: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority | null;
  dueDate?: string | null;
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

const statusFilterOptions = [{ value: 'ALL', label: 'Todas' }, ...statusOptions];

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-CO');
}

function statusColor(status?: string | null) {
  if (status === 'DONE') return 'green';
  if (status === 'DOING') return 'blue';
  return 'gray';
}

function priorityColor(priority?: string | null) {
  if (priority === 'HIGH') return 'red';
  if (priority === 'MEDIUM') return 'yellow';
  return 'gray';
}

function formatStatusLabel(status?: TaskStatus | null) {
  if (status === 'DOING') return 'EN CURSO';
  if (status === 'DONE') return 'HECHA';
  return 'ABIERTA';
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
  const [assignedToUserId, setAssignedToUserId] = useState<string | null>(null);
  const [assignedToEmployeeId, setAssignedToEmployeeId] = useState<string | null>(null);

  const [users, setUsers] = useState<User[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);

  const [assetsModalOpen, setAssetsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
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
          label: `${getEmployeeName(employee)}${employee.phone ? ' · WhatsApp' : ' · Sin teléfono'}`,
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
    setAssignedToUserId(null);
    setAssignedToEmployeeId(null);
  };

  const openCreate = () => {
    resetForm();
    setCreating(true);
  };

  const closeCreate = () => setCreating(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
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
          {loading ? (
            <Center py="xl">
              <Loader />
            </Center>
          ) : (
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <div>
                  <Text fw={700}>Lista de pendientes</Text>
                  <Text size="sm" c="dimmed">
                    {filteredTasks.length} de {tasks.length} pendiente
                    {tasks.length === 1 ? '' : 's'}.
                  </Text>
                </div>
                <Badge color="gray" variant="light">
                  Tablero general
                </Badge>
              </Group>

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

              {filteredTasks.length ? (
                <>
                  <Paper withBorder radius="lg" p="sm" visibleFrom="sm">
                    <Table withTableBorder={false} verticalSpacing="md">
                      <TableThead>
                        <TableTr>
                          <TableTh>Tarea</TableTh>
                          <TableTh>Prioridad</TableTh>
                          <TableTh>Vence</TableTh>
                          <TableTh>Asignado</TableTh>
                          <TableTh>Estado</TableTh>
                          <TableTh>Seriales</TableTh>
                        </TableTr>
                      </TableThead>
                      <TableTbody>
                        {filteredTasks.map((task) => {
                          const dueState = getDueState(task.dueDate);
                          return (
                            <TableTr key={task.id}>
                              <TableTd>
                                <Stack gap={4}>
                                  <Group gap="xs">
                                    <Text fw={600}>{task.title}</Text>
                                    {task.bulkItemName ? (
                                      <Badge variant="light" color="grape" leftSection={<IconPackage size={12} />}>
                                        {task.bulkItemName}
                                      </Badge>
                                    ) : null}
                                  </Group>
                                  {task.description ? (
                                    <Text size="xs" c="dimmed">
                                      {task.description}
                                    </Text>
                                  ) : null}
                                </Stack>
                              </TableTd>
                              <TableTd>
                                <Select
                                  aria-label={`Prioridad de ${task.title}`}
                                  value={task.priority ?? 'MEDIUM'}
                                  onChange={(value) =>
                                    updateTask(task.id, {
                                      priority: (value as TaskPriority) || 'MEDIUM',
                                    })
                                  }
                                  data={priorityOptions}
                                  size="xs"
                                  w={120}
                                  allowDeselect={false}
                                />
                              </TableTd>
                              <TableTd>
                                <Stack gap="xs">
                                  <Text size="sm">{formatDate(task.dueDate)}</Text>
                                  {dueState ? (
                                    <Badge color={dueState.tone} variant="light" w="fit-content">
                                      {dueState.label}
                                    </Badge>
                                  ) : null}
                                </Stack>
                              </TableTd>
                              <TableTd>
                                <Select
                                  value={getTaskAssigneeValue(task)}
                                  onChange={(value) => updateTask(task.id, parseAssigneeValue(value))}
                                  data={assigneeOptions}
                                  size="xs"
                                  w={220}
                                  placeholder="-"
                                  searchable
                                  clearable
                                  disabled={assigneesLoading}
                                />
                              </TableTd>
                              <TableTd>
                                <Select
                                  aria-label={`Estado de ${task.title}`}
                                  value={task.status ?? 'OPEN'}
                                  onChange={(value) =>
                                    updateTask(task.id, {
                                      status: (value as TaskStatus) || 'OPEN',
                                    })
                                  }
                                  data={statusOptions}
                                  size="xs"
                                  w={120}
                                  allowDeselect={false}
                                />
                              </TableTd>
                              <TableTd>
                                <Button size="xs" variant="light" onClick={() => openAssetsModal(task)}>
                                  Seriales
                                </Button>
                              </TableTd>
                            </TableTr>
                          );
                        })}
                      </TableTbody>
                    </Table>
                  </Paper>

                  <Stack gap="sm" hiddenFrom="sm">
                    {filteredTasks.map((task) => {
                      const dueState = getDueState(task.dueDate);
                      return (
                        <Paper key={task.id} withBorder radius="lg" p="md">
                          <Stack gap="md">
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                              <Stack gap={4} style={{ flex: 1 }}>
                                <Text fw={700}>{task.title}</Text>
                                {task.description ? (
                                  <Text size="sm" c="dimmed">
                                    {task.description}
                                  </Text>
                                ) : null}
                              </Stack>
                              <Badge color={statusColor(task.status)} variant="light">
                                {formatStatusLabel(task.status)}
                              </Badge>
                            </Group>

                            <Group gap="xs">
                              <Badge color={priorityColor(task.priority)} variant="light">
                                {formatPriorityLabel(task.priority)}
                              </Badge>
                              {dueState ? (
                                <Badge color={dueState.tone} variant="light">
                                  {dueState.label}
                                </Badge>
                              ) : null}
                              {task.bulkItemName ? (
                                <Badge color="grape" variant="light" leftSection={<IconPackage size={12} />}>
                                  {task.bulkItemName}
                                </Badge>
                              ) : null}
                            </Group>

                            <Stack gap="xs">
                              <Group gap="xs" wrap="nowrap">
                                <ThemeIcon size={28} radius="xl" variant="light" color="gray">
                                  <IconCalendarEvent size={15} />
                                </ThemeIcon>
                                <Text size="sm" c="dimmed">
                                  Vence
                                </Text>
                                <Text size="sm" fw={600}>
                                  {formatDate(task.dueDate)}
                                </Text>
                              </Group>
                              <Group gap="xs" wrap="nowrap">
                                <ThemeIcon size={28} radius="xl" variant="light" color="blue">
                                  <IconUserCheck size={15} />
                                </ThemeIcon>
                                <Text size="sm" c="dimmed">
                                  Responsable
                                </Text>
                                <Text size="sm" fw={600} lineClamp={1}>
                                  {getTaskAssigneeName(task)}
                                </Text>
                              </Group>
                            </Stack>

                            <SimpleGrid cols={1} spacing="sm">
                              <Select
                                label="Prioridad"
                                value={task.priority ?? 'MEDIUM'}
                                onChange={(value) =>
                                  updateTask(task.id, {
                                    priority: (value as TaskPriority) || 'MEDIUM',
                                  })
                                }
                                data={priorityOptions}
                              />
                              <Select
                                label="Estado"
                                value={task.status ?? 'OPEN'}
                                onChange={(value) =>
                                  updateTask(task.id, {
                                    status: (value as TaskStatus) || 'OPEN',
                                  })
                                }
                                data={statusOptions}
                              />
                              <Select
                                label="Responsable"
                                value={getTaskAssigneeValue(task)}
                                onChange={(value) => updateTask(task.id, parseAssigneeValue(value))}
                                data={assigneeOptions}
                                placeholder="-"
                                searchable
                                clearable
                                disabled={assigneesLoading}
                              />
                            </SimpleGrid>

                            <Button variant="light" onClick={() => openAssetsModal(task)}>
                              Gestionar seriales
                            </Button>
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Stack>
                </>
              ) : (
                <Paper withBorder radius="lg" p="xl" bg="gray.0">
                  <Stack align="center" gap="sm">
                    <ThemeIcon size={48} radius="xl" variant="light" color="gray">
                      <IconChecklist size={24} />
                    </ThemeIcon>
                    <Text fw={700}>No hay pendientes para los filtros actuales</Text>
                    <Text size="sm" c="dimmed" ta="center">
                      Cambia el estado, limpia la búsqueda o crea un nuevo pendiente.
                    </Text>
                    {search || statusFilter !== 'ALL' ? (
                      <Button
                        variant="light"
                        onClick={() => {
                          setSearch('');
                          setStatusFilter('ALL');
                        }}
                      >
                        Limpiar filtros
                      </Button>
                    ) : null}
                  </Stack>
                </Paper>
              )}
            </Stack>
          )}
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
            <Button onClick={handleCreate} loading={saving} disabled={!title.trim()}>
              Guardar
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
