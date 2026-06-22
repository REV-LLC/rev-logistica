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
};

type Employee = {
  id: string;
  name: string;
  lastName?: string;
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
  { value: 'OPEN', label: 'OPEN' },
  { value: 'DOING', label: 'DOING' },
  { value: 'DONE', label: 'DONE' },
];

const priorityOptions = [
  { value: 'LOW', label: 'LOW' },
  { value: 'MEDIUM', label: 'MEDIUM' },
  { value: 'HIGH', label: 'HIGH' },
];

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
    return { assignedToUserId: value.slice('user:'.length), assignedToEmployeeId: null };
  }
  if (value.startsWith('employee:')) {
    return { assignedToUserId: null, assignedToEmployeeId: value.slice('employee:'.length) };
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
  if (diffDays <= 2) return { tone: 'yellow' as const, label: 'Upcoming' };
  return { tone: 'gray' as const, label: 'Programada' };
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const [usersData, employeesData] = await Promise.all([
          api<User[]>('/users?active=true'),
          api<Employee[]>('/employees'),
        ]);
        if (mounted) {
          setUsers(usersData);
          setEmployees(employeesData.filter((employee) => employee.active !== false));
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Could not load assignees');
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
        group: 'Active users',
        items: users.map((user) => ({
          value: `user:${user.id}`,
          label: user.email ? `${user.name} · ${user.email}` : user.name,
        })),
      },
      {
        group: 'Employees',
        items: employees.map((employee) => ({
          value: `employee:${employee.id}`,
          label: getEmployeeName(employee),
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
        if (mounted) setError(err instanceof Error ? err.message : 'Could not load tasks');
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
      setError(err instanceof Error ? err.message : 'Could not create task');
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
          if (match) next.assignedToEmployee = { id: match.id, name: getEmployeeName(match), active: match.active };
        }
        return next;
      });
    });
    try {
      await api(`/tasks/${id}`, { method: 'PATCH', json: patch });
    } catch (err) {
      setTasks(previous);
      setError(err instanceof Error ? err.message : 'Could not update task');
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
      setError(err instanceof Error ? err.message : 'Could not load assets');
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
      setError(err instanceof Error ? err.message : 'Could not search assets');
    } finally {
      setAssetSearching(false);
    }
  };

  const addAssetToTask = async (assetId: string) => {
    if (!selectedTask) return;
    try {
      await api(`/tasks/${selectedTask.id}/assets`, { method: 'POST', json: { assetId } });
      await loadTaskAssets(selectedTask.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link asset');
    }
  };

  const removeAssetFromTask = async (assetId: string) => {
    if (!selectedTask) return;
    try {
      await api(`/tasks/${selectedTask.id}/assets/${assetId}`, { method: 'DELETE' });
      await loadTaskAssets(selectedTask.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove asset');
    }
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <PageHeaderCard
          title="Tasks"
          description="Organize tasks, follow-ups, and related assets from one operational view."
          icon={<IconChecklist size={20} />}
          iconColor="yellow"
          accentColor="rgba(245,158,11,0.12)"
          aside={
            <Button onClick={openCreate} leftSection={<IconPlus size={16} />}>
              New task
            </Button>
          }
        >
          <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="md">
            <StatCard
              label="Total"
              value={String(metrics.total)}
              hint="Tareas visibles"
              color="yellow"
              icon={<IconChecklist size={20} />}
            />
            <StatCard
              label="Abiertas"
              value={String(metrics.openCount)}
              hint="Pending start"
              color="gray"
              icon={<IconClock size={20} />}
            />
            <StatCard
              label="En curso"
              value={String(metrics.doingCount)}
              hint="Actualmente trabajando"
              color="blue"
              icon={<IconTargetArrow size={20} />}
            />
            <StatCard
              label="Attention"
              value={String(metrics.dueSoonCount)}
              hint={`${metrics.assignedCount} asignadas · ${metrics.doneCount} hechas`}
              color="green"
              icon={<IconUserCheck size={20} />}
            />
          </SimpleGrid>
        </PageHeaderCard>

        {error ? (
          <Alert color="red" variant="light" title="Could not complete the operation">
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
                  <Text fw={700}>Task list</Text>
                  <Text size="sm" c="dimmed">
                    {tasks.length} task{tasks.length === 1 ? '' : 's'} in the current result.
                  </Text>
                </div>
                <Badge color="gray" variant="light">
                  Tablero general
                </Badge>
              </Group>

              {tasks.length ? (
                <>
                  <Paper withBorder radius="lg" p="sm" visibleFrom="sm">
                    <Table withTableBorder={false} verticalSpacing="md">
                      <TableThead>
                        <TableTr>
                          <TableTh>Title</TableTh>
                          <TableTh>Prioridad</TableTh>
                          <TableTh>Vence</TableTh>
                          <TableTh>Asignado</TableTh>
                          <TableTh>Estado</TableTh>
                          <TableTh>Seriales</TableTh>
                        </TableTr>
                      </TableThead>
                      <TableTbody>
                        {tasks.map((task) => {
                          const dueState = getDueState(task.dueDate);
                          return (
                            <TableTr key={task.id}>
                              <TableTd>
                                <Stack gap={4}>
                                  <Group gap="xs">
                                    <Text fw={600}>{task.title}</Text>
                                    {task.bulkItemName ? (
                                      <Badge
                                        variant="light"
                                        color="grape"
                                        leftSection={<IconPackage size={12} />}
                                      >
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
                                <Stack gap="xs">
                                  <Badge color={priorityColor(task.priority)} variant="light" w="fit-content">
                                    {formatPriorityLabel(task.priority)}
                                  </Badge>
                                  <Select
                                    value={task.priority ?? 'MEDIUM'}
                                    onChange={(value) =>
                                      updateTask(task.id, { priority: (value as TaskPriority) || 'MEDIUM' })
                                    }
                                    data={priorityOptions}
                                    size="xs"
                                    w={120}
                                  />
                                </Stack>
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
                                <Stack gap="xs">
                                  <Badge color={statusColor(task.status)} variant="light" w="fit-content">
                                    {formatStatusLabel(task.status)}
                                  </Badge>
                                  <Select
                                    value={task.status ?? 'OPEN'}
                                    onChange={(value) =>
                                      updateTask(task.id, { status: (value as TaskStatus) || 'OPEN' })
                                    }
                                    data={statusOptions}
                                    size="xs"
                                    w={120}
                                  />
                                </Stack>
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
                    {tasks.map((task) => {
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
                                <Badge
                                  color="grape"
                                  variant="light"
                                  leftSection={<IconPackage size={12} />}
                                >
                                  {task.bulkItemName}
                                </Badge>
                              ) : null}
                            </Group>

                            <SimpleGrid cols={2} spacing="sm">
                              <Paper withBorder radius="md" p="sm" bg="gray.0">
                                <Group gap="xs" wrap="nowrap">
                                  <ThemeIcon size={30} radius="md" variant="light" color="gray">
                                    <IconCalendarEvent size={16} />
                                  </ThemeIcon>
                                  <Stack gap={0}>
                                    <Text size="xs" c="dimmed">Vence</Text>
                                    <Text size="sm" fw={600}>{formatDate(task.dueDate)}</Text>
                                  </Stack>
                                </Group>
                              </Paper>
                              <Paper withBorder radius="md" p="sm" bg="gray.0">
                                <Group gap="xs" wrap="nowrap">
                                  <ThemeIcon size={30} radius="md" variant="light" color="blue">
                                    <IconUserCheck size={16} />
                                  </ThemeIcon>
                                  <Stack gap={0}>
                                    <Text size="xs" c="dimmed">Asignado</Text>
                                    <Text size="sm" fw={600}>
                                      {getTaskAssigneeName(task)}
                                    </Text>
                                  </Stack>
                                </Group>
                              </Paper>
                            </SimpleGrid>

                            <SimpleGrid cols={1} spacing="sm">
                              <Select
                                label="Prioridad"
                                value={task.priority ?? 'MEDIUM'}
                                onChange={(value) =>
                                  updateTask(task.id, { priority: (value as TaskPriority) || 'MEDIUM' })
                                }
                                data={priorityOptions}
                              />
                              <Select
                                label="Estado"
                                value={task.status ?? 'OPEN'}
                                onChange={(value) =>
                                  updateTask(task.id, { status: (value as TaskStatus) || 'OPEN' })
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
                    <Text fw={700}>No tasks for the current filters</Text>
                    <Text size="sm" c="dimmed" ta="center">
                      Adjust the status, clear the search, or create a new task to start working.
                    </Text>
                  </Stack>
                </Paper>
              )}
            </Stack>
          )}
        </Paper>
      </Stack>

      <Modal opened={creating} onClose={closeCreate} title="New task" centered size="lg">
        <Stack gap="lg">
          <Paper withBorder radius="lg" p="md" bg="yellow.0">
            <Group justify="space-between" align="flex-start">
              <Stack gap={2}>
                <Text fw={700}>Alta de pendiente</Text>
                <Text size="sm" c="dimmed">
                  Register an operational action, set priority, and clarify who should move it.
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
                <Text fw={700}>General information</Text>
                <Text size="sm" c="dimmed">
                  Define the objective, details, and task priority.
                </Text>
              </div>
              <TextInput
                label="Title"
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                required
              />
              <Textarea
                label="Description"
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
                minRows={3}
              />
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <Select
                  label="Prioridad"
                  value={priority}
                  onChange={(value) => setPriority((value as TaskPriority) || 'MEDIUM')}
                  data={priorityOptions}
                />
                <TextInput
                  label="Vence"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.currentTarget.value)}
                />
              </SimpleGrid>
            </Stack>
          </Paper>

          <Paper withBorder radius="lg" p="md">
            <Stack gap="md">
              <div>
                <Text fw={700}>Contexto operativo</Text>
                <Text size="sm" c="dimmed">
                  Assign the owner as an active user or operational employee.
                </Text>
              </div>
              <Select
                label="Responsable"
                value={
                  assignedToUserId
                    ? `user:${assignedToUserId}`
                    : assignedToEmployeeId
                    ? `employee:${assignedToEmployeeId}`
                    : null
                }
                onChange={(value) => {
                  const assignee = parseAssigneeValue(value);
                  setAssignedToUserId(assignee.assignedToUserId);
                  setAssignedToEmployeeId(assignee.assignedToEmployeeId);
                }}
                data={assigneeOptions}
                searchable
                clearable
                disabled={assigneesLoading}
                placeholder={assigneesLoading ? 'Loading...' : 'Select'}
              />
            </Stack>
          </Paper>

          <Group justify="flex-end" className="mobile-actions">
            <Button variant="light" onClick={closeCreate} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={saving} disabled={!title.trim()}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={assetsModalOpen}
        onClose={closeAssetsModal}
        title={selectedTask ? `Seriales - ${selectedTask.title}` : 'Seriales'}
        centered
        size="lg"
      >
        <Stack gap="md">
          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <div>
                  <Text fw={700}>Activos vinculados</Text>
                  <Text size="sm" c="dimmed">
                    Serials related to this task for follow-up or pickup.
                  </Text>
                </div>
                <Badge color="gray" variant="light">
                  {taskAssets.length} asset{taskAssets.length === 1 ? '' : 's'}
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
                        <Text size="sm" fw={600}>{asset.serial || asset.name || asset.id}</Text>
                        <ActionIcon
                          variant="light"
                          color="red"
                          aria-label="Remove asset"
                          onClick={() => removeAssetFromTask(asset.id)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Paper>
                  ))}
                  {!taskAssets.length && (
                    <Text size="sm" c="dimmed">
                      No linked assets.
                    </Text>
                  )}
                </Stack>
              )}
            </Stack>
          </Paper>

          <Paper withBorder radius="md" p="md">
            <Stack gap="md">
              <div>
                <Text fw={700}>Search asset</Text>
                <Text size="sm" c="dimmed">
                  Search by serial or name and add it to the task if it belongs to the work.
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
                <TextInput
                  label="Search"
                  value={assetQuery}
                  onChange={(event) => setAssetQuery(event.currentTarget.value)}
                />
                <Button
                  mt={{ base: 0, sm: 25 }}
                  leftSection={<IconSearch size={14} />}
                  onClick={searchAssets}
                  loading={assetSearching}
                >
                  Search
                </Button>
              </SimpleGrid>
              <Stack gap="sm">
                {assetResults.map((asset) => (
                  <Paper key={asset.id} withBorder radius="md" p="sm" bg="gray.0">
                    <Group justify="space-between" align="center" wrap="nowrap">
                      <Text size="sm" fw={600}>{asset.serial || asset.name || asset.id}</Text>
                      <Button size="xs" variant="light" onClick={() => addAssetToTask(asset.id)}>
                        Agregar
                      </Button>
                    </Group>
                  </Paper>
                ))}
                {!assetResults.length && (
                  <Text size="sm" c="dimmed">
                    No results.
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
