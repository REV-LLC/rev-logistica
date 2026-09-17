"use client";

import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Account = {
  id: string;
  email: string;
  active: boolean;
  warehouseId: string | null;
  warehouse: { name: string } | null;
};
type Employee = {
  id: string;
  name: string;
  lastName: string;
  active: boolean;
  pinConfigured: boolean;
};
type Warehouse = { id: string; name: string; active: boolean; type: string };
type AccountDraft = {
  id: string | null;
  identifier: string;
  password: string;
  warehouseId: string;
  active: boolean;
};

export default function WarehouseTabletsSettings() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [draft, setDraft] = useState<AccountDraft | null>(null);
  const [pinEmployee, setPinEmployee] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = async () => {
    const [users, staff, locations] = await Promise.all([
      api<Account[]>("/warehouse-tablets"),
      api<Employee[]>("/warehouse-tablets/employees"),
      api<Warehouse[]>("/warehouses"),
    ]);
    setAccounts(users);
    setEmployees(staff);
    setWarehouses(locations);
  };
  useEffect(() => {
    void load()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);
  const saveAccount = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await api(
        draft.id ? `/warehouse-tablets/${draft.id}` : "/warehouse-tablets",
        {
          method: draft.id ? "PATCH" : "POST",
          json: {
            identifier: draft.identifier,
            warehouseId: draft.warehouseId,
            active: draft.active,
            ...(draft.password ? { password: draft.password } : {}),
          },
        },
      );
      setDraft(null);
      await load();
      setNotice(
        "Perfil guardado. Inicia sesión en la tablet con su usuario y contraseña.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar el perfil.",
      );
    } finally {
      setBusy(false);
    }
  };
  const savePin = async (remove = false) => {
    if (!pinEmployee) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/warehouse-tablets/employees/${pinEmployee.id}/pin`, {
        method: "PATCH",
        json: { pin: remove ? null : pin },
      });
      setPinEmployee(null);
      setPin("");
      await load();
      setNotice(
        remove
          ? "PIN deshabilitado."
          : "PIN guardado. Compártelo de forma privada con el empleado.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar el PIN.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <div>
            <Title order={2}>Tablets de bodega</Title>
            <Text c="dimmed">
              Cada perfil tiene su bodega. Cada documento identifica al empleado
              mediante su PIN.
            </Text>
          </div>
          <Button
            onClick={() => {
              setError(null);
              setDraft({
                id: null,
                identifier: "",
                password: "",
                warehouseId: "",
                active: true,
              });
            }}
          >
            Crear perfil de bodega
          </Button>
        </Group>
        {error && !draft && !pinEmployee ? (
          <Alert color="red">{error}</Alert>
        ) : null}
        {notice ? (
          <Alert color="green" withCloseButton onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        ) : null}
        <Paper withBorder radius="lg" p="md">
          <Title order={3} mb="md">
            Perfiles compartidos
          </Title>
          {loading ? (
            <Text>Cargando perfiles…</Text>
          ) : accounts.length === 0 ? (
            <Text c="dimmed">
              Crea el primer perfil y asígnale una bodega propia.
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={600}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Usuario</Table.Th>
                    <Table.Th>Bodega</Table.Th>
                    <Table.Th>Estado</Table.Th>
                    <Table.Th>Acción</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {accounts.map((account) => (
                    <Table.Tr key={account.id}>
                      <Table.Td>{account.email}</Table.Td>
                      <Table.Td>{account.warehouse?.name ?? 'Bodega no disponible'}</Table.Td>
                      <Table.Td>
                        <Badge color={account.active ? "green" : "gray"}>
                          {account.active ? "Activo" : "Inactivo"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Button
                          variant="light"
                          size="xs"
                          onClick={() => {
                            setError(null);
                            setDraft({
                              id: account.id,
                              identifier: account.email,
                              password: "",
                              warehouseId: account.warehouseId ?? '',
                              active: account.active,
                            });
                          }}
                        >
                          Editar perfil
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Paper>
        <Paper withBorder radius="lg" p="md">
          <Title order={3}>PIN de empleados</Title>
          <Text size="sm" c="dimmed" mb="md">
            Cuatro dígitos, únicos por empleado. El PIN no se puede consultar;
            puedes reemplazarlo o deshabilitarlo.
          </Text>
          <Table.ScrollContainer minWidth={500}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Empleado</Table.Th>
                  <Table.Th>Acceso por PIN</Table.Th>
                  <Table.Th>Acción</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {employees.map((employee) => (
                  <Table.Tr key={employee.id}>
                    <Table.Td>
                      {employee.name} {employee.lastName}
                      {!employee.active ? " · Inactivo" : ""}
                    </Table.Td>
                    <Table.Td>
                      {employee.pinConfigured ? "Configurado" : "Sin PIN"}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => {
                          setError(null);
                          setPin("");
                          setPinEmployee(employee);
                        }}
                      >
                        {employee.pinConfigured ? "Cambiar PIN" : "Asignar PIN"}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
        <Modal
          opened={Boolean(draft)}
          onClose={() => {
            if (!busy) setDraft(null);
          }}
          title={
            draft?.id ? "Editar perfil de bodega" : "Crear perfil de bodega"
          }
          centered
        >
          {draft ? (
            <Stack>
              {error ? <Alert color="red">{error}</Alert> : null}
              <TextInput
                label="Usuario de acceso"
                required
                value={draft.identifier}
                onChange={(event) =>
                  setDraft({ ...draft, identifier: event.currentTarget.value })
                }
              />
              <PasswordInput
                label={draft.id ? "Nueva contraseña (opcional)" : "Contraseña"}
                description="Mínimo 8 caracteres"
                autoComplete="new-password"
                value={draft.password}
                onChange={(event) =>
                  setDraft({ ...draft, password: event.currentTarget.value })
                }
              />
              <Select
                label="Bodega del perfil"
                required
                searchable
                data={warehouses
                  .filter(
                    (warehouse) => warehouse.active && warehouse.type === "OWN",
                  )
                  .map((warehouse) => ({
                    value: warehouse.id,
                    label: warehouse.name,
                  }))}
                value={draft.warehouseId}
                onChange={(value) =>
                  setDraft({ ...draft, warehouseId: value ?? "" })
                }
              />
              <Switch
                label="Perfil activo"
                checked={draft.active}
                onChange={(event) =>
                  setDraft({ ...draft, active: event.currentTarget.checked })
                }
              />
              <Group justify="flex-end">
                <Button
                  variant="default"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  Cancelar
                </Button>
                <Button
                  loading={busy}
                  disabled={
                    !draft.identifier.trim() ||
                    !draft.warehouseId ||
                    (!draft.id && draft.password.length < 8)
                  }
                  onClick={() => void saveAccount()}
                >
                  Guardar perfil
                </Button>
              </Group>
            </Stack>
          ) : null}
        </Modal>
        <Modal
          opened={Boolean(pinEmployee)}
          onClose={() => {
            if (!busy) {
              setPinEmployee(null);
              setPin("");
            }
          }}
          title={`PIN de ${pinEmployee?.name ?? ""} ${pinEmployee?.lastName ?? ""}`}
          centered
        >
          <Stack>
            {error ? <Alert color="red">{error}</Alert> : null}
            <PasswordInput
              label="Nuevo PIN de 4 dígitos"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={4}
              value={pin}
              onChange={(event) =>
                setPin(event.currentTarget.value.replace(/\D/g, "").slice(0, 4))
              }
            />
            <Text size="sm" c="dimmed">
              Al cambiar o deshabilitar el PIN, se pedirá identificar nuevamente
              al empleado en sus borradores abiertos.
            </Text>
            <Group justify="space-between">
              {pinEmployee?.pinConfigured ? (
                <Button
                  color="red"
                  variant="light"
                  disabled={busy}
                  onClick={() => void savePin(true)}
                >
                  Deshabilitar PIN
                </Button>
              ) : null}
              <Button
                loading={busy}
                disabled={pin.length !== 4}
                onClick={() => void savePin()}
              >
                Guardar PIN
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
}
