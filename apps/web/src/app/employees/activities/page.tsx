"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconClipboardText,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { api } from "@/lib/api";
import styles from "./activities.module.css";

type Employee = { id: string; name: string; lastName: string; active: boolean };
type Asset = {
  id: string;
  publicCode: string;
  description: string | null;
  serialOrEngine: string | null;
  sku: { name: string };
};
type Worksite = {
  id: string;
  alias: string | null;
  worksite: { name: string; address: string | null };
};
type Customer = {
  id: string;
  name: string;
  nitOrId: string | null;
  customerWorksites: Worksite[];
};
type Options = { customers: Customer[]; assets: Asset[] };
type Note = {
  id: string;
  date: string;
  description: string;
  assetId: string;
  customerWorksiteId: string;
  asset: Asset;
  customerWorksite: Worksite & { customer: { name: string } };
  createdBy: { employee: { name: string; lastName: string } | null };
  createdAt: string;
  updatedAt: string;
};
type Form = {
  date: string;
  customerWorksiteId: string;
  assetId: string;
  description: string;
};
const fullName = (employee: { name: string; lastName: string }) =>
  `${employee.name} ${employee.lastName}`.trim();
const assetLabel = (asset: Asset) =>
  `${asset.publicCode} · ${asset.sku.name}${asset.serialOrEngine ? ` · ${asset.serialOrEngine}` : ""}${asset.description ? ` · ${asset.description}` : ""}`;
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function dayLabel(date: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
function shiftMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo completar la operación.";

export default function EmployeeActivitiesPage() {
  const requestedEmployeeId = useSearchParams().get("employeeId");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [options, setOptions] = useState<Options>({
    customers: [],
    assets: [],
  });
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [month, setMonth] = useState(() => todayKey().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [retry, setRetry] = useState(0);
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [form, setForm] = useState<Form>({
    date: "",
    customerWorksiteId: "",
    assetId: "",
    description: "",
  });
  const [search, setSearch] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Note | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      api<Employee[]>("/employees"),
      api<Options>("/employee-activities/options"),
    ])
      .then(([people, choices]) => {
        if (!active) return;
        setEmployees(people);
        setOptions(choices);
        setEmployeeId(
          (current) =>
            (people.some((person) => person.id === requestedEmployeeId)
              ? requestedEmployeeId
              : null) ??
            (people.some((person) => person.id === current) ? current : null) ??
            people.find((person) => person.active)?.id ??
            people[0]?.id ??
            null,
        );
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry, requestedEmployeeId]);

  useEffect(() => {
    if (!employeeId) return;
    let active = true;
    setNotesLoading(true);
    setNotes([]);
    setListError(null);
    api<Note[]>(`/employee-activities/${employeeId}?month=${month}`)
      .then((result) => {
        if (active) setNotes(result);
      })
      .catch((reason) => {
        if (active) setListError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setNotesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [employeeId, month, revision]);

  const employee = employees.find((person) => person.id === employeeId);
  const notesByDay = useMemo(() => {
    const grouped = new Map<string, Note[]>();
    for (const note of notes) {
      const key = note.date.slice(0, 10);
      grouped.set(key, [...(grouped.get(key) ?? []), note]);
    }
    return grouped;
  }, [notes]);
  const days = useMemo(() => {
    const first = new Date(`${month}-01T00:00:00Z`);
    const start = new Date(first);
    start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(0);
    const count =
      Math.ceil((((first.getUTCDay() + 6) % 7) + next.getUTCDate()) / 7) * 7;
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
  }, [month]);
  const filteredCustomers = useMemo(() => {
    const query = normalize(search.trim());
    return options.customers.flatMap((customer) => {
      const matchesCustomer = normalize(
        `${customer.name} ${customer.nitOrId ?? ""}`,
      ).includes(query);
      const worksites = matchesCustomer
        ? customer.customerWorksites
        : customer.customerWorksites.filter((site) =>
            normalize(
              `${site.alias ?? ""} ${site.worksite.name} ${site.worksite.address ?? ""}`,
            ).includes(query),
          );
      return matchesCustomer || worksites.length
        ? [{ ...customer, customerWorksites: worksites }]
        : [];
    });
  }, [options.customers, search]);
  const assetOptions = useMemo(() => {
    const assets = [...options.assets];
    if (editing && !assets.some((item) => item.id === editing.assetId))
      assets.push(editing.asset);
    return assets.map((asset) => ({
      value: asset.id,
      label: assetLabel(asset),
    }));
  }, [options.assets, editing]);
  const chosenSite = options.customers
    .flatMap((customer) =>
      customer.customerWorksites.map((site) => ({
        ...site,
        customerName: customer.name,
      })),
    )
    .find((site) => site.id === form.customerWorksiteId);
  const chosenSiteLabel = chosenSite
    ? `${chosenSite.customerName} · ${chosenSite.alias || chosenSite.worksite.name}`
    : editing?.customerWorksiteId === form.customerWorksiteId
      ? `${editing.customerWorksite.customer.name} · ${editing.customerWorksite.worksite.name}`
      : null;
  const selectedNotes = notesByDay.get(selectedDate) ?? [];

  function changeMonth(nextMonth: string) {
    setMonth(nextMonth);
    setSelectedDate(`${nextMonth}-01`);
  }
  function openNote(note?: Note) {
    setEditing(note ?? null);
    setFormError(null);
    setSearch("");
    setForm(
      note
        ? {
            date: note.date.slice(0, 10),
            customerWorksiteId: note.customerWorksiteId,
            assetId: note.assetId,
            description: note.description,
          }
        : {
            date: selectedDate,
            customerWorksiteId: "",
            assetId: "",
            description: "",
          },
    );
    setOpened(true);
  }
  async function save() {
    if (!employeeId || saving) return;
    if (
      !form.date ||
      !form.customerWorksiteId ||
      !form.assetId ||
      !form.description.trim()
    ) {
      setFormError("Completa la fecha, la obra, el activo y la descripción.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api(
        `/employee-activities/${employeeId}${editing ? `/${editing.id}` : ""}`,
        {
          method: editing ? "PATCH" : "POST",
          json: { ...form, description: form.description.trim() },
        },
      );
      setMonth(form.date.slice(0, 7));
      setSelectedDate(form.date);
      setRevision((value) => value + 1);
      setOpened(false);
    } catch (reason) {
      setFormError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!employeeId || !deleting || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      await api(`/employee-activities/${employeeId}/${deleting.id}`, {
        method: "DELETE",
      });
      setDeleting(null);
      setRevision((value) => value + 1);
    } catch (reason) {
      setFormError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        <Group justify="space-between">
          <Group>
            <ThemeIcon size={48} radius="md" variant="light" color="orange">
              <IconCalendar size={26} />
            </ThemeIcon>
            <div>
              <Title order={2}>Bitácora de empleados</Title>
              <Text c="dimmed" size="sm">
                Actividades, obras y notas del día a día de tu equipo.
              </Text>
            </div>
          </Group>
          <Button
            leftSection={<IconPlus size={18} />}
            disabled={!employeeId || loading || Boolean(error)}
            onClick={() => openNote()}
          >
            Nueva nota
          </Button>
        </Group>
        {error ? (
          <Alert color="red" title="No se pudo cargar la bitácora">
            {error}
            <Button
              variant="subtle"
              onClick={() => setRetry((value) => value + 1)}
            >
              Reintentar
            </Button>
          </Alert>
        ) : null}
        <Paper withBorder radius="lg" p="md">
          <Group justify="space-between" align="end">
            <Select
              label="Calendario del empleado"
              placeholder="Selecciona un empleado"
              searchable
              nothingFoundMessage="No se encontraron empleados"
              data={employees.map((person) => ({
                value: person.id,
                label: `${fullName(person)}${person.active ? "" : " · Inactivo"}`,
              }))}
              value={employeeId}
              onChange={setEmployeeId}
              allowDeselect={false}
              disabled={loading || opened || Boolean(deleting)}
              w={{ base: "100%", sm: 340 }}
            />
            <Group gap="xs">
              <ActionIcon
                variant="light"
                size="lg"
                aria-label="Mes anterior"
                onClick={() => changeMonth(shiftMonth(month, -1))}
              >
                <IconChevronLeft size={18} />
              </ActionIcon>
              <Text fw={700} tt="capitalize" w={155} ta="center">
                {new Intl.DateTimeFormat("es-CO", {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(`${month}-01T00:00:00Z`))}
              </Text>
              <ActionIcon
                variant="light"
                size="lg"
                aria-label="Mes siguiente"
                onClick={() => changeMonth(shiftMonth(month, 1))}
              >
                <IconChevronRight size={18} />
              </ActionIcon>
              <Button
                variant="default"
                size="xs"
                onClick={() => {
                  const today = todayKey();
                  setMonth(today.slice(0, 7));
                  setSelectedDate(today);
                }}
              >
                Hoy
              </Button>
            </Group>
          </Group>
        </Paper>
        {loading ? (
          <Group justify="center" p="xl">
            <Loader />
            <Text>Cargando bitácora…</Text>
          </Group>
        ) : !error && !employees.length ? (
          <Paper p="xl" withBorder>
            <Text>
              No hay empleados registrados. Crea un empleado para comenzar su
              bitácora.
            </Text>
          </Paper>
        ) : !error ? (
          <>
            {listError ? (
              <Alert color="red" title="No se pudieron cargar las notas">
                {listError}
                <Button
                  variant="subtle"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  Reintentar
                </Button>
              </Alert>
            ) : null}
            <div className={styles.layout}>
              <Paper
                withBorder
                radius="lg"
                className={styles.calendar}
                aria-busy={notesLoading}
              >
                <Group justify="space-between" p="md">
                  <Text fw={700}>
                    {employee ? fullName(employee) : "Calendario"}
                  </Text>
                  <Badge variant="light" color="orange">
                    {notesLoading
                      ? "Cargando…"
                      : `${notes.length} ${notes.length === 1 ? "nota" : "notas"} este mes`}
                  </Badge>
                </Group>
                <div className={styles.grid}>
                  {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(
                    (day) => (
                      <div className={styles.weekday} key={day}>
                        {day}
                      </div>
                    ),
                  )}
                </div>
                <div className={styles.grid}>
                  {days.map((date) => {
                    const dayNotes = notesByDay.get(date) ?? [];
                    return (
                      <button
                        key={date}
                        type="button"
                        aria-label={`${dayLabel(date)}, ${dayNotes.length} notas`}
                        aria-pressed={selectedDate === date}
                        className={`${styles.day} ${date.slice(0, 7) !== month ? styles.outside : ""} ${selectedDate === date ? styles.selected : ""}`}
                        onClick={() => {
                          setSelectedDate(date);
                          if (date.slice(0, 7) !== month)
                            setMonth(date.slice(0, 7));
                        }}
                      >
                        <span
                          className={
                            date === todayKey() ? styles.today : styles.number
                          }
                        >
                          {Number(date.slice(8))}
                        </span>
                        <span className={styles.previews}>
                          {dayNotes.slice(0, 2).map((note) => (
                            <span key={note.id} className={styles.preview}>
                              {note.description}
                            </span>
                          ))}
                        </span>
                        {dayNotes.length ? (
                          <span className={styles.count}>
                            {dayNotes.length}{" "}
                            {dayNotes.length === 1 ? "nota" : "notas"}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </Paper>
              <Paper withBorder radius="lg" p="md">
                <Stack gap="md">
                  <div>
                    <Text size="xs" fw={700} c="orange" tt="uppercase">
                      Registro del día
                    </Text>
                    <Text fw={700} tt="capitalize" mt={4}>
                      {dayLabel(selectedDate)}
                    </Text>
                  </div>
                  <Button
                    variant="light"
                    leftSection={<IconPlus size={16} />}
                    onClick={() => openNote()}
                  >
                    Agregar nota para este día
                  </Button>
                  {notesLoading ? (
                    <Loader size="sm" />
                  ) : listError ? (
                    <Text c="dimmed" size="sm">
                      Reintenta la carga para consultar las notas de este día.
                    </Text>
                  ) : !selectedNotes.length ? (
                    <Stack align="center" py="xl" gap="xs">
                      <IconClipboardText size={36} color="#a6adb6" />
                      <Text fw={600}>Un día por registrar</Text>
                      <Text size="sm" c="dimmed" ta="center">
                        Agrega una nota para dejar constancia de la actividad
                        del empleado.
                      </Text>
                    </Stack>
                  ) : (
                    selectedNotes.map((note) => (
                      <Paper key={note.id} withBorder radius="md" p="sm">
                        <Stack gap="xs">
                          <Text size="xs" fw={700} c="orange">
                            {note.customerWorksite.customer.name}
                          </Text>
                          <Text fw={650} size="sm">
                            {note.customerWorksite.alias ||
                              note.customerWorksite.worksite.name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {assetLabel(note.asset)}
                          </Text>
                          <Text
                            size="sm"
                            style={{
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {note.description}
                          </Text>
                          <Text size="xs" c="dimmed">
                            Registrada por{" "}
                            {note.createdBy.employee
                              ? fullName(note.createdBy.employee)
                              : "Usuario interno"}{" "}
                            ·{" "}
                            {new Date(note.createdAt).toLocaleString("es-CO", {
                              timeZone: "America/Bogota",
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </Text>
                          <Group justify="end" gap="xs">
                            <ActionIcon
                              variant="subtle"
                              aria-label="Editar nota"
                              onClick={() => openNote(note)}
                            >
                              <IconPencil size={17} />
                            </ActionIcon>
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              aria-label="Eliminar nota"
                              onClick={() => {
                                setFormError(null);
                                setDeleting(note);
                              }}
                            >
                              <IconTrash size={17} />
                            </ActionIcon>
                          </Group>
                        </Stack>
                      </Paper>
                    ))
                  )}
                </Stack>
              </Paper>
            </div>
          </>
        ) : null}
      </Stack>
      <Modal
        opened={opened}
        onClose={() => {
          if (!saving) setOpened(false);
        }}
        title={
          <Text fw={750} size="lg">
            {editing ? "Editar nota" : "Nueva nota de actividad"}
          </Text>
        }
        size="lg"
        radius="lg"
        centered
        closeOnClickOutside={!saving}
        closeOnEscape={!saving}
        withCloseButton={!saving}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Stack gap="md">
            <Paper p="sm" radius="md" bg="orange.0">
              <Text size="sm" fw={700}>
                {employee ? fullName(employee) : ""}
              </Text>
              <Text size="xs" c="dimmed">
                Deja el contexto de su actividad para que el equipo pueda darle
                seguimiento.
              </Text>
            </Paper>
            {formError ? <Alert color="red">{formError}</Alert> : null}
            <TextInput
              type="date"
              label="Fecha de la actividad"
              required
              value={form.date}
              disabled={saving}
              onChange={(event) =>
                setForm({ ...form, date: event.currentTarget.value })
              }
            />
            <div>
              <Text size="sm" fw={500} mb={6}>
                Obra{" "}
                <Text component="span" c="red">
                  *
                </Text>
              </Text>
              {chosenSiteLabel ? (
                <Alert color="orange" mb="xs" title="Obra seleccionada">
                  {chosenSiteLabel}
                </Alert>
              ) : null}
              <Paper withBorder radius="md" p="sm">
                <TextInput
                  aria-label="Buscar cliente u obra"
                  placeholder="Buscar cliente, documento u obra…"
                  leftSection={<IconSearch size={16} />}
                  value={search}
                  disabled={saving}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  mb="xs"
                />
                <ScrollArea.Autosize mah={240} type="auto">
                  <Accordion
                    variant="separated"
                    radius="md"
                    key={search ? "filtered" : "all"}
                    defaultValue={search ? filteredCustomers[0]?.id : undefined}
                  >
                    {filteredCustomers.map((customer) => (
                      <Accordion.Item key={customer.id} value={customer.id}>
                        <Accordion.Control disabled={saving}>
                          <Text size="sm" fw={600}>
                            {customer.name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {customer.nitOrId ? `${customer.nitOrId} · ` : ""}
                            {customer.customerWorksites.length} obras
                          </Text>
                        </Accordion.Control>
                        <Accordion.Panel>
                          <Stack gap={6}>
                            {customer.customerWorksites.length ? (
                              customer.customerWorksites.map((site) => (
                                <UnstyledButton
                                  key={site.id}
                                  disabled={saving}
                                  className={`${styles.worksite} ${form.customerWorksiteId === site.id ? styles.chosen : ""}`}
                                  aria-pressed={
                                    form.customerWorksiteId === site.id
                                  }
                                  onClick={() =>
                                    setForm({
                                      ...form,
                                      customerWorksiteId: site.id,
                                    })
                                  }
                                >
                                  <Text size="sm" fw={600}>
                                    {site.alias || site.worksite.name}
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    {site.worksite.address ||
                                      site.worksite.name}
                                  </Text>
                                </UnstyledButton>
                              ))
                            ) : (
                              <Text size="sm" c="dimmed">
                                Este cliente no tiene obras disponibles.
                              </Text>
                            )}
                          </Stack>
                        </Accordion.Panel>
                      </Accordion.Item>
                    ))}
                  </Accordion>
                  {!filteredCustomers.length ? (
                    <Text p="md" size="sm" c="dimmed">
                      No se encontraron clientes u obras.
                    </Text>
                  ) : null}
                </ScrollArea.Autosize>
              </Paper>
            </div>
            <Select
              label="Activo / equipo"
              placeholder="Busca por código, equipo o serie"
              searchable
              required
              nothingFoundMessage="No se encontraron activos"
              data={assetOptions}
              value={form.assetId || null}
              disabled={saving}
              onChange={(value) => setForm({ ...form, assetId: value ?? "" })}
            />
            <Textarea
              label="Descripción de la actividad"
              placeholder="Describe qué hizo el empleado, observaciones o novedades del día…"
              required
              minRows={4}
              autosize
              maxRows={9}
              maxLength={5000}
              value={form.description}
              disabled={saving}
              onChange={(event) =>
                setForm({ ...form, description: event.currentTarget.value })
              }
              description={`${form.description.length} / 5000 caracteres`}
            />
            <Group justify="end">
              <Button
                variant="default"
                disabled={saving}
                onClick={() => setOpened(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                Guardar nota
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
      <Modal
        opened={Boolean(deleting)}
        onClose={() => {
          if (!saving) setDeleting(null);
        }}
        title="Eliminar nota"
        centered
        radius="lg"
        closeOnClickOutside={!saving}
        closeOnEscape={!saving}
        withCloseButton={!saving}
      >
        <Stack>
          {formError ? <Alert color="red">{formError}</Alert> : null}
          <Text>¿Quieres eliminar esta nota de la bitácora?</Text>
          <Text size="sm" c="dimmed" lineClamp={3}>
            {deleting?.description}
          </Text>
          <Group justify="end">
            <Button
              variant="default"
              disabled={saving}
              onClick={() => setDeleting(null)}
            >
              Cancelar
            </Button>
            <Button color="red" loading={saving} onClick={() => void remove()}>
              Eliminar nota
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
