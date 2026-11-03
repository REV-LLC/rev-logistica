"use client";
import styles from "./annex-send.module.css";
import { useEffect, useRef, useState } from "react";
import { Alert, Autocomplete, Button, Modal, Stack, Text } from "@mantine/core";
import {
  IconBrandWhatsapp,
  IconMail,
  IconFileTypePdf,
} from "@tabler/icons-react";
import { createAnnexPdf, type AnnexExport } from "@/lib/annex-pdf";
import { api } from "@/lib/api";
type Contact = { value: string; label: string };
type Recipients = { phones: Contact[]; emails: Contact[] };
type Channel = "WHATSAPP" | "EMAIL";
export default function AnnexSend({
  data,
  customerWorksiteId,
  onClose,
}: {
  data: AnnexExport | null;
  customerWorksiteId: string | null;
  onClose: () => void;
}) {
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [phone, setPhone] = useState(""),
    [email, setEmail] = useState("");
  const [contacts, setContacts] = useState<Recipients>({
    phones: [],
    emails: [],
  });
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [sending, setSending] = useState<Channel | null>(null);
  const sendingRef = useRef(false);
  const requestKeys = useRef(new Map<string, string>());
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setPdf(null);
    setError(null);
    setContactError(null);
    setMessage(null);
    setPhone("");
    setEmail("");
    setContacts({ phones: [], emails: [] });
    requestKeys.current.clear();
    if (!data || !customerWorksiteId) return () => controller.abort();
    setLoadingContacts(true);
    createAnnexPdf(data)
      .then((blob) => {
        if (active) setPdf(blob);
      })
      .catch((error) => {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : "No se pudo generar el PDF del anexo.",
          );
      });
    api<Recipients>(
      `/annexes/worksites/${encodeURIComponent(customerWorksiteId)}/recipients`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (active) setContacts(value);
      })
      .catch(() => {
        if (active)
          setContactError(
            "No se pudieron cargar los contactos. Puedes escribir el número o correo directamente.",
          );
      })
      .finally(() => {
        if (active) setLoadingContacts(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [data, customerWorksiteId]);
  function download() {
    if (!pdf || !data) return;
    const url = URL.createObjectURL(pdf),
      link = document.createElement("a");
    link.href = url;
    link.download = `Anexo-${data.input.period.from}-${data.input.period.through}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  async function send(channel: Channel) {
    if (!pdf || !data || !customerWorksiteId || sendingRef.current) return;
    const recipient = (channel === "WHATSAPP" ? phone : email).trim();
    if (!recipient) {
      setError("Selecciona un contacto o escribe el destinatario.");
      return;
    }
    sendingRef.current = true;
    setSending(channel);
    setError(null);
    setMessage(null);
    const key = `${channel}:${recipient.toLowerCase()}`;
    if (!requestKeys.current.has(key))
      requestKeys.current.set(key, crypto.randomUUID());
    const body = new FormData();
    body.append("channel", channel);
    body.append("recipient", recipient);
    body.append("from", data.input.period.from);
    body.append("to", data.input.period.to);
    body.append("through", data.input.period.through);
    body.append("requestId", requestKeys.current.get(key)!);
    body.append(
      "pdf",
      pdf,
      `Anexo-${data.input.period.from}-${data.input.period.through}.pdf`,
    );
    try {
      const response = await api<{
        sent: boolean;
        recipient: string;
        status: string;
      }>(`/annexes/worksites/${encodeURIComponent(customerWorksiteId)}/send`, {
        method: "POST",
        body,
      });
      if (!response.sent)
        throw new Error("No se pudo confirmar el envío del anexo.");
      setMessage(
        channel === "WHATSAPP"
          ? `WhatsApp aceptó el anexo para entregarlo a ${response.recipient}.`
          : `Anexo enviado por correo a ${response.recipient}, con el PDF adjunto.`,
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "No se pudo enviar el anexo.",
      );
    } finally {
      sendingRef.current = false;
      setSending(null);
    }
  }
  return (
    <Modal
      classNames={{ content: styles.content, header: styles.header, body: styles.body }}
      overlayProps={{ backgroundOpacity: 0.3, blur: 2 }}
      opened={!!data}
      onClose={() => {
        if (!sendingRef.current) onClose();
      }}
      closeOnClickOutside={!sending}
      closeOnEscape={!sending}
      withCloseButton={!sending}
      title="Enviar anexo"
      size="md"
    >
      <Stack>
        <Text size="sm">
          Selecciona un contacto de la obra o del cliente, o escribe otro
          destino. El anexo se envía desde la aplicación con el PDF adjunto.
        </Text>
        {error && <Alert color="red">{error}</Alert>}
        {contactError && <Alert color="yellow">{contactError}</Alert>}
        {message && (
          <Alert color="green" role="status">
            {message}
          </Alert>
        )}
        <Autocomplete
          label="WhatsApp del destinatario"
          placeholder={
            loadingContacts
              ? "Cargando contactos…"
              : "Busca un contacto o escribe el número"
          }
          description="Número colombiano de 10 dígitos, con o sin +57."
          data={contacts.phones.map((contact) => contact.label)}
          value={phone}
          onChange={(value) =>
            setPhone(
              contacts.phones.find((contact) => contact.label === value)
                ?.value ?? value,
            )
          }
          disabled={!!sending}
        />
        <Button
          color="green"
          leftSection={<IconBrandWhatsapp size={18} />}
          disabled={!pdf || !phone.trim() || !!sending}
          loading={sending === "WHATSAPP"}
          onClick={() => send("WHATSAPP")}
        >
          Enviar por WhatsApp
        </Button>
        <Autocomplete
          label="Correo del destinatario"
          placeholder={
            loadingContacts
              ? "Cargando contactos…"
              : "Busca un contacto o escribe el correo"
          }
          data={contacts.emails.map((contact) => contact.label)}
          value={email}
          onChange={(value) =>
            setEmail(
              contacts.emails.find((contact) => contact.label === value)
                ?.value ?? value,
            )
          }
          disabled={!!sending}
          inputMode="email"
        />
        <Button
          leftSection={<IconMail size={18} />}
          disabled={!pdf || !email.trim() || !!sending}
          loading={sending === "EMAIL"}
          onClick={() => send("EMAIL")}
        >
          Enviar por correo
        </Button>
        <Button
          variant="light"
          leftSection={<IconFileTypePdf size={18} />}
          loading={!pdf && !error}
          disabled={!pdf || !!sending}
          onClick={download}
        >
          Descargar PDF
        </Button>
      </Stack>
    </Modal>
  );
}
