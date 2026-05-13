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
  Switch,
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
  Title,
} from '@mantine/core';
import {
  IconChecklist,
  IconClock,
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
  bulkItemName?: string | null;
  assignedToUser?: {
    id: string;
    name: string;
  } | null;
};

type User = {
  id: string;
  name: string;
};

type Asset = {
  id: string;
  serial?: string | null;
  name?: string | null;
};

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

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>('ALL');
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState<string | null>(null);
  const [bulkItemName, setBulkItemName] = useState('');

  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [assetsModalOpen, setAssetsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskAssets, setTaskAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetSearchMode, setAssetSearchMode] = useState<'serial' | 'search'>('serial');
  const [assetQuery, setAssetQuery] = useState('');
  const [assetResults, setAssetResults] = useState<Asset[]>([]);
  const [assetSearching, setAssetSearching] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    let mounted = true;
    const loadUsers = async () => {
      setUsersLoading(true);
      try {
        const data = await api<User[]>('/users?active=true&role=ADMIN');
        if (mounted) setUsers(data);
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar usuarios');
        }
      } finally {
        if (mounted) setUsersLoading(false);
      }
    };
    loadUsers();
    return () => {
      mounted = false;
    };
  }, []);

  const userOptions = useMemo(
    () => users.map((user) => ({ value: user.id, label: user.name })),
    [users],
  );

  const params = useMemo(() => {
    const search = new URLSearchParams();
    if (statusFilter !== 'ALL') search.set('status', statusFilter);
    if (assignedToMe) search.set('assignedToMe', 'true');
    if (debouncedQuery) search.set('q', debouncedQuery);
    return search.toString();
  }, [statusFilter, assignedToMe, debouncedQuery]);

  useEffect(() => {
    let mounted = true;
    const loadTasks = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api<Task[]>(`/tasks${params ? `?${params}` : ''}`);
        if (mounted) setTasks(data);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'No se pudo cargar tareas');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadTasks();
    return () => {
      mounted = false;
    };
  }, [params]);

  const metrics = useMemo(() => {
    const openCount = tasks.filter((task) => (task.status ?? 'OPEN') === 'OPEN').length;
    const doingCount = tasks.filter((task) => task.status === 'DOING').length;
    const doneCount = tasks.filter((task) => task.status === 'DONE').length;
    const assignedCount = tasks.filter((task) => task.assignedToUserId).length;
    return {
      total: tasks.length,
      openCount,
      doingCount,
      doneCount,
      assignedCount,
    };
  }, [tasks]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPriority('MEDIUM');
    setDueDate('');
    setAssignedToUserId(null);
    setBulkItemName('');
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
          bulkItemName: bulkItemName.trim() || undefined,
        },
      });
      closeCreate();
      resetForm();
      const data = await api<Task[]>(`/tasks${params ? `?${params}` : ''}`);
      setTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear tarea');
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
        return next;
      });
    });
    try {
      await api(`/tasks/${id}`, { method: 'PATCH', json: patch });
    } catch (err) {
      setTasks(previous);
      setError(err instanceof Error ? err.message : 'No se pudo actualizar tarea');
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
      setError(err instanceof Error ? err.message : 'No se pudo cargar activos');
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
      setError(err instanceof Error ? err.message : 'No se pudo buscar activos');
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
      setError(err instanceof Error ? err.message : 'No se pudo vincular activo');
    }
  };

  const removeAssetFromTask = async (assetId: string) => {
    if (!selectedTask) return;
    try {
      await api(`/tasks/${selectedTask.id}/assets/${assetId}`, { method: 'DELETE' });
      await loadTaskAssets(selectedTask.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo quitar activo');
    }
  };

  const hasFilters = Boolean(query.trim()) || statusFilter !== 'ALL' || assignedToMe;

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <PageHeaderCard
          title="Pendientes"
          description="Organiza tareas, seguimientos y activos relacionados desde una sola vista operativa."
          icon={<IconChecklist size={20} />}
          iconColor="yellow"
          accentColor="rgba(245,158,11,0.12)"
          aside={
            <Button onClick={openCreate} leftSection={<IconPlus size={16} />}>
              Nueva tarea
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
              hint="Pendientes por empezar"
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
              label="Asignadas"
              value={String(metrics.assignedCount)}
              hint={`${metrics.doneCount} completadas`}
              color="green"
              icon={<IconUserCheck size={20} />}
            />
          </SimpleGrid>
        </PageHeaderCard>

        {error ? (
          <Alert color="red" variant="light" title="No se pudo completar la operación">
            {error}
          </Alert>
        ) : null}

        <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <div>
                <Text fw={700}>Filtros</Text>
                <Text size="sm" c="dimmed">
                  Filtra por estado, texto o tareas asignadas para reducir el tablero.
                </Text>
              </div>
              {hasFilters ? (
                <Button
                  variant="subtle"
                  color="gray"
                  onClick={() => {
                    setStatusFilter('ALL');
                    setAssignedToMe(false);
                    setQuery('');
                  }}
                >
                  Limpiar filtros
                </Button>
              ) : null}
            </Group>

            <Group align="flex-end" gap="md" wrap="wrap">
              <Select
                label="Estado"
                value={statusFilter}
                onChange={(value) => setStatusFilter((value as TaskStatus) || 'ALL')}
                data={[{ value: 'ALL', label: 'TODOS' }, ...statusOptions]}
                w={200}
              />
              <TextInput
                label="Buscar"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Título o texto..."
                w={260}
                leftSection={<IconSearch size={16} />}
              />
              <Switch
                label="Asignadas a mí"
                checked={assignedToMe}
                onChange={(event) => setAssignedToMe(event.currentTarget.checked)}
                mt={4}
              />
            </Group>
          </Stack>
        </Paper>

        <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
          {loading ? (
            <Center py="xl">
              <Loader />
            </Center>
          ) : (
            <Stack gap="md">
              <div>
                <Text fw={700}>Lista de tareas</Text>
                <Text size="sm" c="dimmed">
                  {tasks.length} tarea{tasks.length === 1 ? '' : 's'} en el resultado actual.
                </Text>
              </div>

              <Table withTableBorder={false} verticalSpacing="md">
                <TableThead>
                  <TableTr>
                    <TableTh>Título</TableTh>
                    <TableTh>Prioridad</TableTh>
                    <TableTh>Vence</TableTh>
                    <TableTh>Asignado</TableTh>
                    <TableTh>Estado</TableTh>
                    <TableTh>Seriales</TableTh>
                  </TableTr>
                </TableThead>
                <TableTbody>
                  {tasks.map((task) => (
                    <TableTr key={task.id}>
                      <TableTd>
                        <Stack gap={2}>
                          <Text fw={600}>{task.title}</Text>
                          {task.description ? (
                            <Text size="xs" c="dimmed">
                              {task.description}
                            </Text>
                          ) : null}
                          {task.bulkItemName ? (
                            <Text size="xs" c="dimmed">
                              BULK: {task.bulkItemName}
                            </Text>
                          ) : null}
                        </Stack>
                      </TableTd>
                      <TableTd>
                        <Group gap="xs">
                          <Badge color={priorityColor(task.priority)} variant="light">
                            {task.priority ?? 'MEDIUM'}
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
                        </Group>
                      </TableTd>
                      <TableTd>{formatDate(task.dueDate)}</TableTd>
                      <TableTd>
                        {userOptions.length ? (
                          <Select
                            value={task.assignedToUserId ?? null}
                            onChange={(value) =>
                              updateTask(task.id, { assignedToUserId: value || null })
                            }
                            data={userOptions}
                            size="xs"
                            w={180}
                            placeholder="-"
                          />
                        ) : (
                          task.assignedToUser?.name || task.assignedToUserId || '-'
                        )}
                      </TableTd>
                      <TableTd>
                        <Group gap="xs">
                          <Badge color={statusColor(task.status)} variant="light">
                            {task.status ?? 'OPEN'}
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
                        </Group>
                      </TableTd>
                      <TableTd>
                        <Button size="xs" variant="light" onClick={() => openAssetsModal(task)}>
                          Seriales
                        </Button>
                      </TableTd>
                    </TableTr>
                  ))}
                  {!tasks.length && (
                    <TableTr>
                      <TableTd colSpan={6}>
                        <Text c="dimmed" ta="center">
                          No hay tareas para los filtros actuales.
                        </Text>
                      </TableTd>
                    </TableTr>
                  )}
                </TableTbody>
              </Table>
            </Stack>
          )}
        </Paper>
      </Stack>

      <Modal opened={creating} onClose={closeCreate} title="Nueva tarea" centered size="lg">
        <Stack gap="lg">
          <Paper withBorder radius="lg" p="md">
            <Stack gap="md">
              <div>
                <Text fw={700}>Información general</Text>
                <Text size="sm" c="dimmed">
                  Define el objetivo, detalle y prioridad de la tarea.
                </Text>
              </div>
              <TextInput
                label="Título"
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                required
              />
              <Textarea
                label="Descripción"
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
                  Asigna responsable y, si aplica, relaciona la tarea con un item bulk.
                </Text>
              </div>
              <TextInput
                label="Bulk (nombre)"
                value={bulkItemName}
                onChange={(event) => setBulkItemName(event.currentTarget.value)}
              />
              <Select
                label="Asignar a"
                value={assignedToUserId}
                onChange={setAssignedToUserId}
                data={userOptions}
                searchable
                clearable
                disabled={usersLoading}
                placeholder={usersLoading ? 'Cargando...' : 'Seleccionar'}
              />
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

      <Modal
        opened={assetsModalOpen}
        onClose={closeAssetsModal}
        title={selectedTask ? `Seriales - ${selectedTask.title}` : 'Seriales'}
        centered
        size="lg"
      >
        <Stack gap="md">
          <Paper withBorder radius="md" p="md">
            <Stack gap="xs">
              <Text fw={700}>Activos vinculados</Text>
              {assetsLoading ? (
                <Center py="sm">
                  <Loader size="sm" />
                </Center>
              ) : (
                <Stack gap="xs">
                  {taskAssets.map((asset) => (
                    <Group key={asset.id} justify="space-between">
                      <Text size="sm">{asset.serial || asset.name || asset.id}</Text>
                      <ActionIcon
                        variant="light"
                        color="red"
                        aria-label="Quitar activo"
                        onClick={() => removeAssetFromTask(asset.id)}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  ))}
                  {!taskAssets.length && (
                    <Text size="sm" c="dimmed">
                      No hay activos vinculados.
                    </Text>
                  )}
                </Stack>
              )}
            </Stack>
          </Paper>

          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Text fw={700}>Buscar activo</Text>
              <Group align="flex-end" gap="sm" wrap="wrap">
                <Select
                  label="Modo"
                  value={assetSearchMode}
                  onChange={(value) => setAssetSearchMode((value as 'serial' | 'search') || 'serial')}
                  data={[
                    { value: 'serial', label: 'SERIAL' },
                    { value: 'search', label: 'NOMBRE' },
                  ]}
                  w={140}
                />
                <TextInput
                  label="Buscar"
                  value={assetQuery}
                  onChange={(event) => setAssetQuery(event.currentTarget.value)}
                  w={240}
                />
                <Button
                  leftSection={<IconSearch size={14} />}
                  onClick={searchAssets}
                  loading={assetSearching}
                >
                  Buscar
                </Button>
              </Group>
              <Stack gap="xs">
                {assetResults.map((asset) => (
                  <Group key={asset.id} justify="space-between">
                    <Text size="sm">{asset.serial || asset.name || asset.id}</Text>
                    <Button size="xs" variant="light" onClick={() => addAssetToTask(asset.id)}>
                      Agregar
                    </Button>
                  </Group>
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
