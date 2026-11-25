"use client";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Divider,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { api } from "@/lib/api";
export type ContactProfile = {
  contactName: string | null;
  customer: { id: string; name: string; active: boolean } | null;
  customerWorksite: {
    id: string;
    active: boolean;
    worksite: { name: string; active: boolean };
  } | null;
  version: number;
  updatedAt: string | null;
};
export type IntakeDetails = {
  contactName?: string | null;
  customer: string | null;
  worksite: string | null;
};
export type LinkableRequest = {
  id: string;
  details: IntakeDetails;
  customerId?: string | null;
  customerWorksiteId?: string | null;
  linkedContactName?: string | null;
  linkedCustomerName?: string | null;
  linkedWorksiteName?: string | null;
};
type Choice = { id: string; name: string };
export default function ContactReviewModal({
  phone,
  profile,
  request,
  draft,
  onClose,
  onSaved,
}: {
  phone: string;
  profile: ContactProfile;
  request: LinkableRequest | null;
  draft: IntakeDetails;
  onClose: () => void;
  onSaved: () => void;
}) {
  const declared = request?.details ?? draft;
  const initialCustomer =
    request?.customerId && request.linkedCustomerName
      ? { id: request.customerId, name: request.linkedCustomerName }
      : !request && profile.customer
        ? profile.customer
        : null;
  const [contactName, setContactName] = useState(
      request?.linkedContactName ||
        declared.contactName ||
        profile.contactName ||
        "",
    ),
    [customer, setCustomer] = useState<Choice | null>(initialCustomer),
    [worksite, setWorksite] = useState<Choice | null>(
      request?.customerWorksiteId && request.linkedWorksiteName
        ? { id: request.customerWorksiteId, name: request.linkedWorksiteName }
        : !request && profile.customerWorksite
          ? {
              id: profile.customerWorksite.id,
              name: profile.customerWorksite.worksite.name,
            }
          : null,
    );
  const [customerSearch, setCustomerSearch] = useState(
      initialCustomer?.name ?? declared.customer ?? "",
    ),
    [customerQuery] = useDebouncedValue(customerSearch, 250),
    [worksiteSearch, setWorksiteSearch] = useState(declared.worksite ?? ""),
    [worksiteQuery] = useDebouncedValue(worksiteSearch, 250);
  const [customers, setCustomers] = useState<Choice[]>([]),
    [worksites, setWorksites] = useState<Choice[]>([]),
    [newCustomer, setNewCustomer] = useState(false),
    [newWorksite, setNewWorksite] = useState(false),
    [customerName, setCustomerName] = useState(declared.customer ?? ""),
    [documentType, setDocumentType] = useState("NIT"),
    [document, setDocument] = useState(""),
    [worksiteName, setWorksiteName] = useState(declared.worksite ?? ""),
    [address, setAddress] = useState(""),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const customerSeq = useRef(0),
    worksiteSeq = useRef(0),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const seq = ++customerSeq.current;
    void api<Choice[]>(
      `/whatsapp-customers/catalog/customers?search=${encodeURIComponent(customerQuery)}`,
    )
      .then((data) => {
        if (seq === customerSeq.current) setCustomers(data);
      })
      .catch(() => {
        if (seq === customerSeq.current)
          setError("No se pudo consultar el directorio de clientes");
      });
    return () => {
      customerSeq.current++;
    };
  }, [customerQuery]);
  useEffect(() => {
    setWorksites([]);
    if (!customer) return;
    const seq = ++worksiteSeq.current;
    void api<Choice[]>(
      `/whatsapp-customers/catalog/worksites?customerId=${customer.id}&search=${encodeURIComponent(worksiteQuery)}`,
    )
      .then((data) => {
        if (seq === worksiteSeq.current) setWorksites(data);
      })
      .catch(() => {
        if (seq === worksiteSeq.current)
          setError("No se pudieron consultar las obras");
      });
    return () => {
      worksiteSeq.current++;
    };
  }, [customer?.id, worksiteQuery]);
  const customerOptions = [
    ...new Map(
      [...(customer ? [customer] : []), ...customers].map((c) => [
        c.id,
        { value: c.id, label: c.name },
      ]),
    ).values(),
  ];
  const worksiteOptions = [
    ...new Map(
      [...(worksite ? [worksite] : []), ...worksites].map((c) => [
        c.id,
        { value: c.id, label: c.name },
      ]),
    ).values(),
  ];
  async function createCustomer() {
    if (!customerName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api<Choice>("/customers", {
        method: "POST",
        json: {
          name: customerName.trim(),
          ...(document.trim()
            ? { identityDocumentType: documentType, nitOrId: document.trim() }
            : {}),
        },
      });
      if (!alive.current) return;
      setCustomer(created);
      setCustomerSearch(created.name);
      setWorksite(null);
      setNewCustomer(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo crear el cliente. Revisa el directorio antes de reintentar.",
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function createWorksite() {
    if (!customer || !worksiteName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string; worksite: { name: string } }>(
        "/worksites",
        {
          method: "POST",
          json: {
            customerId: customer.id,
            name: worksiteName.trim(),
            ...(address.trim() ? { address: address.trim() } : {}),
          },
        },
      );
      if (!alive.current) return;
      setWorksite({ id: created.id, name: created.worksite.name });
      setWorksiteSearch(created.worksite.name);
      setNewWorksite(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo crear la obra. Revisa el directorio antes de reintentar.",
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function save() {
    if (!customer || contactName.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/whatsapp-customers/${phone}/profile`, {
        method: "POST",
        json: {
          contactName: contactName.trim(),
          customerId: customer.id,
          ...(worksite ? { customerWorksiteId: worksite.id } : {}),
          ...(request ? { requestId: request.id } : {}),
          version: profile.version,
        },
      });
      if (alive.current) onSaved();
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "No se pudo guardar la vinculación",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Modal
      opened
      onClose={onClose}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      withCloseButton={!busy}
      title={
        request
          ? "Revisar contacto y vincular pedido"
          : "Registrar contacto de WhatsApp"
      }
      size="lg"
    >
      <Stack>
        <Text size="sm" c="dimmed">
          Número: +{phone}. Los datos recibidos se conservan; tú decides a qué
          cliente y obra corresponden.
        </Text>
        {error && <Alert color="red">{error}</Alert>}
        <TextInput
          label="Nombre de la persona"
          value={contactName}
          onChange={(e) => setContactName(e.currentTarget.value)}
          maxLength={80}
          required
          disabled={busy}
        />
        <Text size="sm">
          Empresa indicada:{" "}
          <strong>{declared.customer || "Sin indicar"}</strong>
          <br />
          Obra indicada: <strong>{declared.worksite || "Sin indicar"}</strong>
        </Text>
        <Select
          label="Cliente del sistema"
          placeholder="Busca y elige el cliente existente"
          data={customerOptions}
          value={customer?.id ?? null}
          onChange={(value) => {
            const found = customerOptions.find((o) => o.value === value);
            setCustomer(found ? { id: found.value, name: found.label } : null);
            setWorksite(null);
          }}
          searchable
          clearable
          onSearchChange={setCustomerSearch}
          nothingFoundMessage="No hay coincidencias. Puedes crear un cliente abajo."
          filter={({ options }) => options}
          disabled={busy}
          required
        />
        <Button
          size="xs"
          variant="subtle"
          onClick={() => setNewCustomer((v) => !v)}
          disabled={busy}
        >
          {newCustomer ? "Cerrar creación de cliente" : "Crear cliente nuevo"}
        </Button>
        {newCustomer && (
          <Stack
            p="sm"
            style={{
              border: "1px solid var(--mantine-color-default-border)",
              borderRadius: 8,
            }}
          >
            <Text fw={600} size="sm">
              Nuevo cliente
            </Text>
            <Text size="xs" c="dimmed">
              Comprueba las coincidencias para evitar duplicados. Se creará un
              cliente real al pulsar el botón.
            </Text>
            <TextInput
              label="Nombre del nuevo cliente"
              value={customerName}
              onChange={(e) => setCustomerName(e.currentTarget.value)}
              maxLength={160}
              required
              disabled={busy}
            />
            <Group grow>
              <Select
                label="Tipo de documento"
                value={documentType}
                onChange={(v) => setDocumentType(v ?? "NIT")}
                data={["NIT", "CC"]}
                disabled={busy}
              />
              <TextInput
                label="Número de documento (opcional)"
                value={document}
                onChange={(e) => setDocument(e.currentTarget.value)}
                maxLength={40}
                disabled={busy}
              />
            </Group>
            <Button
              onClick={() => void createCustomer()}
              loading={busy}
              disabled={!customerName.trim()}
            >
              Crear cliente
            </Button>
          </Stack>
        )}
        <Select
          label="Obra del cliente (opcional)"
          placeholder={
            customer
              ? "Busca y elige una obra"
              : "Primero selecciona el cliente"
          }
          data={worksiteOptions}
          value={worksite?.id ?? null}
          onChange={(value) => {
            const found = worksiteOptions.find((o) => o.value === value);
            setWorksite(found ? { id: found.value, name: found.label } : null);
          }}
          searchable
          clearable
          onSearchChange={setWorksiteSearch}
          filter={({ options }) => options}
          nothingFoundMessage="No hay coincidencias. Borra la búsqueda o crea una obra."
          disabled={busy || !customer}
        />
        <Button
          size="xs"
          variant="subtle"
          disabled={busy || !customer}
          onClick={() => setNewWorksite((v) => !v)}
        >
          {newWorksite ? "Cerrar creación de obra" : "Crear obra nueva"}
        </Button>
        {newWorksite && customer && (
          <Stack
            p="sm"
            style={{
              border: "1px solid var(--mantine-color-default-border)",
              borderRadius: 8,
            }}
          >
            <Text fw={600} size="sm">
              Nueva obra para {customer.name}
            </Text>
            <TextInput
              label="Nombre de la nueva obra"
              value={worksiteName}
              onChange={(e) => setWorksiteName(e.currentTarget.value)}
              required
              maxLength={160}
              disabled={busy}
            />
            <TextInput
              label="Dirección de la obra (opcional)"
              value={address}
              onChange={(e) => setAddress(e.currentTarget.value)}
              maxLength={350}
              disabled={busy}
            />
            <Button
              onClick={() => void createWorksite()}
              loading={busy}
              disabled={!worksiteName.trim()}
            >
              Crear obra
            </Button>
          </Stack>
        )}
        <Divider />
        <Text size="xs" c="dimmed">
          Se guardará el perfil de WhatsApp para reconocer a esta persona en
          futuras solicitudes.
          {request
            ? " Este pedido quedará vinculado al cliente y la obra elegidos; los otros pedidos se conservan."
            : " No se cambiarán las vinculaciones de pedidos anteriores."}{" "}
          Los teléfonos oficiales del cliente y de la obra no se reemplazan.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            onClick={() => void save()}
            loading={busy}
            disabled={!customer || contactName.trim().length < 2}
          >
            {request
              ? "Guardar contacto y vincular pedido"
              : "Guardar contacto"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
