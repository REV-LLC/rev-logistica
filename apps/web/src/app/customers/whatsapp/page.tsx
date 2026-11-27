"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconArrowLeft,
  IconCheck,
  IconMessageCircle,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";
import { api, apiBlob } from "@/lib/api";
import { getCurrentUserRole } from "@/lib/auth";
import styles from "./whatsapp.module.css";
import WhatsappAudio from "@/components/WhatsappAudio";
import WhatsappDocument from "@/components/WhatsappDocument";
import OfficeComposer, {
  type OfficeMessage,
  officeStatus,
} from "./OfficeComposer";
import ContactReviewModal, {
  type ContactProfile,
  type LinkableRequest,
} from "./ContactReviewModal";

type Draft = {
  contactName?: string | null;
  items: { equipment: string; quantity: number | null }[];
  customer: string | null;
  worksite: string | null;
  start: string | null;
  duration: string | null;
  transport: string | null;
};
type Chat = {
  contactName?: string | null;
  declaredCustomer?: string | null;
  declaredWorksite?: string | null;
  registered?: boolean;
  requestCount?: number;
  itemSummary?: string;
  phone: string;
  customers: string[];
  latest: string;
  count: number;
  pending: boolean;
  paused: boolean;
  preview: string;
};
type Listing = {
  chats: Chat[];
  nextPage: number | null;
  enabled: boolean;
  profilesEnabled?: boolean;
};
type Message = {
  documentAvailable?: boolean;
  mediaFilename?: string | null;
  audioAvailable?: boolean;
  id: string;
  text: string;
  type: string;
  sentAt: string;
  createdAt: string;
  replyText: string | null;
  replySentAt: string | null;
  error: string | null;
};
type Detail = {
  officeMessages?: OfficeMessage[];
  officeBefore?: string | null;
  replyWindowEndsAt?: string | null;
  officeRepliesEnabled?: boolean;
  profile: ContactProfile;
  customers: string[];
  phone: string;
  draft: Draft;
  paused: boolean;
  notes: string;
  latest: string | null;
  reviewedThrough: string | null;
  messages: Message[];
  before: string | null;
  requests: {
    customerId?: string | null;
    customerWorksiteId?: string | null;
    linkedContactName?: string | null;
    linkedCustomerName?: string | null;
    linkedWorksiteName?: string | null;
    linkedAt?: string | null;
    id: string;
    details: Draft & { requestedAt?: string };
    createdAt: string;
    status: string;
  }[];
};
const date = (d: string) =>
  new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(d));
const name = (chat?: { customers: string[]; contactName?: string | null }) =>
  chat?.contactName ||
  (chat?.customers.length === 1
    ? chat.customers[0]
    : chat?.customers.length
      ? "Contacto de varios clientes"
      : "Contacto nuevo");
function RequestDetails({ draft }: { draft: Draft }) {
  return (
    <Stack gap={5}>
      {draft.items.map((item, i) => (
        <Text key={i} size="sm">
          {item.quantity ?? "Cantidad por definir"} × {item.equipment}
        </Text>
      ))}
      {[
        ["Solicita", draft.contactName],
        ["Empresa o cliente", draft.customer],
        ["Obra", draft.worksite],
        ["Fecha solicitada", draft.start],
        ["Duración", draft.duration],
        ["Transporte", draft.transport],
      ].map(([label, value]) => (
        <Text key={label} size="sm">
          <Text component="span" c="dimmed">
            {label}:{" "}
          </Text>
          {value ||
            (label === "Solicita"
              ? "No indicado en el pedido"
              : "Por completar")}
        </Text>
      ))}
    </Stack>
  );
}
function Photo({ phone, id }: { phone: string; id: string }) {
  const [url, setUrl] = useState<string | null>(null),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const ref = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (ref.current) URL.revokeObjectURL(ref.current);
    },
    [],
  );
  async function open() {
    setBusy(true);
    setError(false);
    try {
      const blob = await apiBlob(
        `/whatsapp-customers/${phone}/messages/${id}/photo`,
      );
      if (ref.current) URL.revokeObjectURL(ref.current);
      const next = URL.createObjectURL(blob);
      ref.current = next;
      setUrl(next);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {url ? (
        <img
          src={url}
          alt="Foto enviada por el cliente"
          className={styles.photo}
        />
      ) : (
        <Button
          size="xs"
          variant="light"
          loading={busy}
          onClick={() => void open()}
        >
          Ver foto
        </Button>
      )}
      {error && (
        <Text size="xs" c="dimmed">
          La foto no está disponible en WhatsApp. Solicita al cliente que la
          reenvíe.
        </Text>
      )}
    </div>
  );
}
export default function CustomerWhatsappPage() {
  const [reviewTarget, setReviewTarget] = useState<{
    request: LinkableRequest | null;
  } | null>(null);
  const requestSection = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("search");
    if (q) setSearch(q.slice(0, 100));
  }, []);
  const [allowed, setAllowed] = useState<boolean | null>(null),
    [listing, setListing] = useState<Listing | null>(null),
    [page, setPage] = useState(0),
    [search, setSearch] = useState(""),
    [query] = useDebouncedValue(search, 300),
    [status, setStatus] = useState("all"),
    [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [notes, setNotes] = useState(""),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false);
  const detailSeq = useRef(0),
    listSeq = useRef(0);
  useEffect(
    () => setAllowed(["ADMIN", "OFFICE"].includes(getCurrentUserRole() ?? "")),
    [],
  );
  useEffect(() => setPage(0), [query, status]);
  const loadList = useCallback(async () => {
    const seq = ++listSeq.current;
    try {
      const data = await api<Listing>(
        `/whatsapp-customers?search=${encodeURIComponent(query)}&status=${status}&page=${page}`,
      );
      if (seq === listSeq.current) setListing(data);
    } catch (e) {
      if (seq === listSeq.current)
        setError(
          e instanceof Error ? e.message : "No se pudo cargar la bandeja",
        );
    }
  }, [query, status, page]);
  useEffect(() => {
    if (!allowed) return;
    void loadList();
    const timer = setInterval(() => void loadList(), 15000);
    return () => {
      clearInterval(timer);
      listSeq.current++;
    };
  }, [allowed, loadList]);
  const loadDetail = useCallback(
    async (phone: string, preserveNotes = false) => {
      const seq = ++detailSeq.current;
      setBusy(true);
      setError(null);
      try {
        const data = await api<Detail>(`/whatsapp-customers/${phone}`);
        if (seq === detailSeq.current) {
          setDetail(data);
          if (!preserveNotes) setNotes(data.notes);
        }
      } catch (e) {
        if (seq === detailSeq.current)
          setError(e instanceof Error ? e.message : "No se pudo abrir el chat");
      } finally {
        if (seq === detailSeq.current) setBusy(false);
      }
    },
    [],
  );
  useEffect(() => {
    setDetail(null);
    if (selected) void loadDetail(selected);
    return () => {
      detailSeq.current++;
    };
  }, [selected, loadDetail]);
  async function save(paused: boolean, reviewed: boolean) {
    if (!detail) return;
    const seq = detailSeq.current;
    setSaving(true);
    setError(null);
    try {
      await api(`/whatsapp-customers/${detail.phone}`, {
        method: "PATCH",
        json: {
          notes,
          paused,
          ...(reviewed && detail.latest
            ? { reviewedThrough: detail.latest }
            : {}),
        },
      });
      if (seq === detailSeq.current) await loadDetail(detail.phone);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }
  async function older() {
    if (!detail?.before) return;
    const phone = detail.phone,
      seq = detailSeq.current;
    setBusy(true);
    try {
      const data = await api<Detail>(
        `/whatsapp-customers/${phone}?before=${detail.before}`,
      );
      if (seq === detailSeq.current)
        setDetail((d) =>
          d && d.phone === phone
            ? {
                ...d,
                before: data.before,
                messages: [...data.messages, ...d.messages],
              }
            : d,
        );
    } catch {
      setError("No se pudieron cargar los mensajes anteriores");
    } finally {
      if (seq === detailSeq.current) setBusy(false);
    }
  }
  async function olderOffice() {
    if (!detail?.officeBefore) return;
    const phone = detail.phone,
      seq = detailSeq.current;
    setBusy(true);
    try {
      const data = await api<{
        messages: OfficeMessage[];
        before: string | null;
      }>(
        `/whatsapp-customers/${phone}/office-messages?before=${detail.officeBefore}`,
      );
      if (seq === detailSeq.current)
        setDetail((d) =>
          d && d.phone === phone
            ? {
                ...d,
                officeBefore: data.before,
                officeMessages: [
                  ...new Map(
                    [...data.messages, ...(d.officeMessages ?? [])].map((m) => [
                      m.id,
                      m,
                    ]),
                  ).values(),
                ],
              }
            : d,
        );
    } catch {
      if (seq === detailSeq.current)
        setError("No se pudieron cargar las respuestas anteriores.");
    } finally {
      if (seq === detailSeq.current) setBusy(false);
    }
  }
  if (allowed === null)
    return (
      <Container py="xl">
        <Loader />
      </Container>
    );
  if (!allowed)
    return (
      <Container py="xl">
        <Alert color="red">
          Esta bandeja es exclusiva para administración y oficina.
        </Alert>
      </Container>
    );
  const listedContact = listing?.chats.find((c) => c.phone === selected);
  const contact =
    listedContact ??
    (detail
      ? {
          customers: detail.customers ?? [],
          contactName:
            detail.draft.contactName ||
            detail.requests[0]?.details.contactName ||
            detail.profile?.contactName,
        }
      : undefined);
  const hasNew = !!(
    detail?.latest &&
    listedContact &&
    new Date(listedContact.latest) > new Date(detail.latest)
  );
  return (
    <Container size="xl" py="lg">
      <Stack gap="lg">
        <Group justify="space-between">
          <div>
            <Group gap="xs">
              <IconMessageCircle />
              <Title order={2}>Chats de clientes</Title>
            </Group>
            <Text c="dimmed" size="sm" mt={5}>
              Revisa las conversaciones y las solicitudes de alquiler antes de
              coordinarlas.
            </Text>
          </div>
          <Button
            variant="subtle"
            leftSection={<IconRefresh size={16} />}
            onClick={() => void loadList()}
          >
            Actualizar bandeja
          </Button>
        </Group>
        {error && (
          <Alert color="red" withCloseButton onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {listing && !listing.enabled && (
          <Alert color="yellow">
            El asistente de clientes está desactivado. Puedes revisar los
            mensajes que recibió el canal.
          </Alert>
        )}
        <div className={styles.layout}>
          <Paper
            withBorder
            p="md"
            radius="md"
            className={`${styles.sidebar} ${selected ? styles.hideMobile : ""}`}
          >
            <Stack gap="sm">
              <TextInput
                aria-label="Buscar conversación"
                placeholder="Persona, empresa, obra o teléfono"
                leftSection={<IconSearch size={16} />}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
              />
              <Select
                aria-label="Estado de revisión"
                value={status}
                onChange={(v) => setStatus(v ?? "all")}
                data={[
                  { value: "all", label: "Todos los chats" },
                  ...(listing?.profilesEnabled
                    ? [
                        { value: "requests", label: "Pedidos recibidos" },
                        { value: "unlinked", label: "Contactos por registrar" },
                      ]
                    : []),
                  { value: "pending", label: "Por revisar" },
                  { value: "reviewed", label: "Revisados" },
                  { value: "paused", label: "Bot en pausa" },
                ]}
              />
              {!listing ? (
                <Loader size="sm" />
              ) : !listing.chats.length ? (
                <Text c="dimmed" py="xl" ta="center">
                  No hay conversaciones en este filtro.
                </Text>
              ) : (
                listing.chats.map((chat) => (
                  <button
                    key={chat.phone}
                    className={styles.chat}
                    data-selected={chat.phone === selected}
                    onClick={() => setSelected(chat.phone)}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Text fw={600} size="sm" lineClamp={1}>
                        {name(chat)}
                      </Text>
                      {chat.pending && (
                        <Badge size="xs" color="yellow">
                          Por revisar
                        </Badge>
                      )}
                    </Group>
                    <Text size="sm" mt={4}>
                      +{chat.phone}
                    </Text>
                    <Text c="dimmed" size="xs" mt={4}>
                      {chat.declaredCustomer ||
                        chat.customers[0] ||
                        "Empresa por indicar"}
                      {chat.declaredWorksite
                        ? ` · ${chat.declaredWorksite}`
                        : ""}
                    </Text>
                    <Text c="dimmed" size="sm" lineClamp={2} mt={5}>
                      {chat.itemSummary || chat.preview}
                    </Text>
                    <Group gap={5} mt="xs">
                      <Badge
                        size="xs"
                        color={chat.requestCount ? "blue" : "gray"}
                      >
                        {chat.requestCount
                          ? `${chat.requestCount} ${chat.requestCount === 1 ? "pedido recibido" : "pedidos recibidos"}`
                          : "En conversación"}
                      </Badge>
                      <Badge
                        size="xs"
                        variant="outline"
                        color={chat.registered ? "green" : "yellow"}
                      >
                        {chat.registered
                          ? "Contacto registrado"
                          : "Por registrar"}
                      </Badge>
                    </Group>
                    <Group justify="space-between" mt="xs">
                      <Text size="xs" c="dimmed">
                        {date(chat.latest)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {chat.paused
                          ? "Bot en pausa"
                          : `${chat.count} mensajes`}
                      </Text>
                    </Group>
                  </button>
                ))
              )}
              <Group justify="space-between">
                <Button
                  size="xs"
                  variant="subtle"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  disabled={listing?.nextPage == null}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </Group>
            </Stack>
          </Paper>
          <Paper
            withBorder
            radius="md"
            className={`${styles.main} ${!selected ? styles.hideMobile : ""}`}
          >
            {!selected ? (
              <Stack align="center" justify="center" mih={400} p="xl">
                <IconMessageCircle size={40} />
                <Text c="dimmed">
                  Selecciona un chat para revisar su conversación.
                </Text>
              </Stack>
            ) : !detail ? (
              <Stack p="xl">
                {busy ? (
                  <Loader />
                ) : (
                  <Text c="dimmed">No se pudo cargar esta conversación.</Text>
                )}
                <Button variant="subtle" onClick={() => setSelected(null)}>
                  Volver a los chats
                </Button>
              </Stack>
            ) : (
              <Stack gap={0}>
                <div className={styles.header}>
                  <Group justify="space-between">
                    <div>
                      <Button
                        className={styles.back}
                        size="xs"
                        variant="subtle"
                        leftSection={<IconArrowLeft size={14} />}
                        onClick={() => setSelected(null)}
                      >
                        Chats
                      </Button>
                      <Text fw={700}>{name(contact)}</Text>
                      <Text size="sm" c="dimmed">
                        +{detail.phone}
                        {detail.profile?.contactName
                          ? " · Contacto registrado por oficina"
                          : " · Contacto pendiente de registro"}
                      </Text>
                    </div>
                    <Button
                      size="xs"
                      variant={detail.paused ? "light" : "default"}
                      color={detail.paused ? "green" : "gray"}
                      loading={saving}
                      leftSection={
                        detail.paused ? (
                          <IconPlayerPlay size={14} />
                        ) : (
                          <IconPlayerPause size={14} />
                        )
                      }
                      onClick={() => void save(!detail.paused, false)}
                    >
                      {detail.paused ? "Reanudar bot" : "Pausar bot"}
                    </Button>
                  </Group>
                  <Group mt="sm" gap="xs">
                    {detail.profile && (
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => setReviewTarget({ request: null })}
                      >
                        {detail.profile?.contactName
                          ? "Editar contacto"
                          : "Registrar contacto"}
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() =>
                        requestSection.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        })
                      }
                    >
                      Ver pedidos ({detail.requests.length})
                    </Button>
                  </Group>
                  {detail.profile?.customer && (
                    <Text size="xs" c="dimmed" mt={5}>
                      Perfil de WhatsApp: {detail.profile.customer.name}
                      {detail.profile.customerWorksite
                        ? ` · ${detail.profile.customerWorksite.worksite.name}`
                        : ""}
                    </Text>
                  )}
                  {detail.paused && (
                    <Text size="xs" c="yellow" mt="xs">
                      Bot en pausa. Los mensajes entrantes se guardan sin
                      respuesta automática.
                    </Text>
                  )}
                  <Button
                    mt="sm"
                    size="xs"
                    variant="subtle"
                    leftSection={<IconRefresh size={14} />}
                    onClick={() => void loadDetail(detail.phone, true)}
                  >
                    {hasNew
                      ? "Hay mensajes nuevos · Actualizar chat"
                      : "Actualizar chat"}
                  </Button>
                </div>
                <div className={styles.messages}>
                  {detail.before && (
                    <Button
                      size="xs"
                      variant="subtle"
                      loading={busy}
                      onClick={() => void older()}
                    >
                      Cargar mensajes anteriores
                    </Button>
                  )}
                  {detail.officeBefore && (
                    <Button
                      variant="subtle"
                      loading={busy}
                      onClick={() => void olderOffice()}
                    >
                      Cargar respuestas anteriores de oficina
                    </Button>
                  )}
                  {[
                    ...detail.messages.map((message) => ({
                      kind: "incoming" as const,
                      time: message.createdAt,
                      id: message.id,
                      message,
                    })),
                    ...(detail.officeMessages ?? []).map((message) => ({
                      kind: "office" as const,
                      time: message.createdAt,
                      id: message.id,
                      message,
                    })),
                  ]
                    .sort(
                      (a, b) =>
                        a.time.localeCompare(b.time) ||
                        a.id.localeCompare(b.id),
                    )
                    .map((entry) => {
                      if (entry.kind === "office") {
                        const m = entry.message;
                        return (
                          <div key={m.id} className={styles.outgoing}>
                            <Text size="xs" fw={600} c="dimmed">
                              Oficina · {m.actorName} · {date(m.createdAt)}
                            </Text>
                            <Text size="sm" className={styles.messageText}>
                              {m.text}
                            </Text>
                            <Text
                              size="xs"
                              c={
                                ["FAILED", "UNCERTAIN", "SENDING"].includes(
                                  m.status,
                                )
                                  ? "yellow"
                                  : "dimmed"
                              }
                              mt={4}
                            >
                              {officeStatus[m.status] ?? "Envío sin confirmar"}
                            </Text>
                            {["UNCERTAIN", "SENDING"].includes(m.status) && (
                              <Text size="xs">
                                Verifica WhatsApp antes de enviar este mensaje
                                otra vez.
                              </Text>
                            )}
                          </div>
                        );
                      }
                      const message = entry.message;
                      return (
                        <div key={message.id}>
                          <div className={styles.incoming}>
                            <Text size="xs" fw={600} c="dimmed">
                              Cliente · {date(message.sentAt)}
                            </Text>
                            <Text size="sm" className={styles.messageText}>
                              {message.text ||
                                ({
                                  image: "Foto recibida",
                                  audio:
                                    "Audio pendiente de escuchar por oficina",
                                  document:
                                    "Documento recibido · requiere revisión",
                                  location: "Ubicación recibida",
                                }[message.type] ??
                                  "Mensaje recibido")}
                            </Text>
                            {message.type === "audio" && (
                              <WhatsappAudio
                                key={message.id}
                                messageId={message.id}
                                available={!!message.audioAvailable}
                              />
                            )}
                            {message.type === "document" && (
                              <WhatsappDocument
                                messageId={message.id}
                                available={!!message.documentAvailable}
                                filename={message.mediaFilename}
                              />
                            )}
                            {message.type === "image" && (
                              <Photo phone={detail.phone} id={message.id} />
                            )}
                          </div>
                          {message.replyText && (
                            <div className={styles.outgoing}>
                              <Text size="xs" fw={600} c="dimmed">
                                Asistente ·{" "}
                                {message.replySentAt
                                  ? date(message.replySentAt)
                                  : "Pendiente de envío"}
                              </Text>
                              <Text size="sm" className={styles.messageText}>
                                {message.replyText}
                              </Text>
                            </div>
                          )}
                          {message.error && (
                            <Text size="xs" c="yellow" mt={4}>
                              Requiere revisión de oficina
                            </Text>
                          )}
                        </div>
                      );
                    })}
                </div>
                <OfficeComposer
                  key={detail.phone}
                  phone={detail.phone}
                  endsAt={detail.replyWindowEndsAt ?? null}
                  enabled={!!detail.officeRepliesEnabled}
                  onSent={() => void loadDetail(detail.phone, true)}
                />
                <div ref={requestSection} className={styles.review}>
                  <Stack gap="md">
                    <Group justify="space-between">
                      <Text fw={600}>Solicitudes recibidas</Text>
                      <Badge color="yellow" variant="light">
                        Revisión de oficina
                      </Badge>
                    </Group>
                    {detail.requests.length ? (
                      detail.requests.map((request) => (
                        <Paper key={request.id} withBorder p="md" radius="md">
                          <Text size="xs" c="dimmed" mb="sm">
                            El cliente confirmó los datos ·{" "}
                            {date(request.createdAt)}
                          </Text>
                          <RequestDetails draft={request.details} />
                          {request.linkedAt && (
                            <Text size="sm" c="green" mt="sm">
                              Vinculado por oficina: {request.linkedContactName}{" "}
                              · {request.linkedCustomerName}
                              {request.linkedWorksiteName
                                ? ` · ${request.linkedWorksiteName}`
                                : ""}
                            </Text>
                          )}
                          {detail.profile && (
                            <Button
                              mt="sm"
                              size="xs"
                              variant="light"
                              onClick={() => setReviewTarget({ request })}
                            >
                              {request.linkedAt
                                ? "Revisar vinculación"
                                : "Vincular pedido y contacto"}
                            </Button>
                          )}
                        </Paper>
                      ))
                    ) : (
                      <Text size="sm" c="dimmed">
                        Todavía no hay una solicitud confirmada por el cliente.
                      </Text>
                    )}
                    {detail.draft.items.length > 0 && (
                      <Paper withBorder p="md">
                        <Text fw={600} size="sm" mb="sm">
                          Borrador en conversación
                        </Text>
                        <RequestDetails draft={detail.draft} />
                      </Paper>
                    )}
                    <Text size="xs" c="dimmed">
                      Las solicitudes no reservan equipos ni confirman precios o
                      entregas. Las fechas relativas se conservan tal como las
                      expresó el cliente; usa la hora del mensaje como
                      referencia.
                    </Text>
                    <Textarea
                      label="Notas internas"
                      description="Solo visibles para administración y oficina"
                      value={notes}
                      onChange={(e) => setNotes(e.currentTarget.value)}
                      maxLength={4000}
                      minRows={3}
                      autosize
                    />
                    <Group justify="flex-end">
                      <Button
                        variant="default"
                        loading={saving}
                        onClick={() => void save(detail.paused, false)}
                      >
                        Guardar notas
                      </Button>
                      <Button
                        leftSection={<IconCheck size={16} />}
                        loading={saving}
                        onClick={() => void save(detail.paused, true)}
                      >
                        Marcar como revisado
                      </Button>
                    </Group>
                  </Stack>
                </div>
              </Stack>
            )}
          </Paper>
        </div>
      </Stack>
      {reviewTarget && detail && (
        <ContactReviewModal
          phone={detail.phone}
          profile={
            detail.profile ?? {
              contactName: null,
              customer: null,
              customerWorksite: null,
              version: 0,
              updatedAt: null,
            }
          }
          request={reviewTarget.request}
          draft={
            detail.draft.items.length
              ? detail.draft
              : (detail.requests[0]?.details ?? detail.draft)
          }
          onClose={() => setReviewTarget(null)}
          onSaved={() => {
            setReviewTarget(null);
            void loadDetail(detail.phone, true);
            void loadList();
          }}
        />
      )}
    </Container>
  );
}
