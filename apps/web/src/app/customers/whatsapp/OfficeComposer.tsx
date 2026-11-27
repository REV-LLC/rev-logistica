"use client";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Stack, Text, Textarea } from "@mantine/core";
import { api, ApiError } from "@/lib/api";
export type OfficeMessage = {
  id: string;
  text: string;
  actorName: string;
  status: string;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
};
export const officeStatus: Record<string, string> = {
  SENDING: "Envío sin confirmar",
  SENT: "Enviado a WhatsApp",
  DELIVERED: "Entregado",
  READ: "Leído",
  FAILED: "No enviado",
  UNCERTAIN: "Envío sin confirmar",
};
export default function OfficeComposer({
  phone,
  endsAt,
  enabled,
  onSent,
}: {
  phone: string;
  endsAt: string | null;
  enabled: boolean;
  onSent: () => void;
}) {
  const [text, setText] = useState(""),
    [sending, setSending] = useState(false),
    [error, setError] = useState(""),
    [checking, setChecking] = useState(false),
    [now, setNow] = useState(Date.now());
  const attempt = useRef<{ id: string; text: string } | null>(null),
    alive = useRef(false),
    busy = useRef(false);
  useEffect(() => {
    alive.current = true;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, []);
  const open = enabled && !!endsAt && new Date(endsAt).getTime() > now;
  async function send() {
    if (busy.current || (!open && !checking) || !text.trim()) return;
    busy.current = true;
    setSending(true);
    setError("");
    attempt.current ??= { id: crypto.randomUUID(), text: text.trim() };
    try {
      const result = await api<OfficeMessage>(
        `/whatsapp-customers/${phone}/messages`,
        { method: "POST", json: attempt.current },
      );
      if (!alive.current) return;
      setText("");
      attempt.current = null;
      setChecking(false);
      onSent();
      if (result.status === "FAILED")
        setError(
          "WhatsApp rechazó el envío. El mensaje quedó guardado como no enviado.",
        );
      else if (["UNCERTAIN", "SENDING"].includes(result.status))
        setError(
          "No se confirmó el envío. Verifica WhatsApp antes de escribir el mismo mensaje otra vez.",
        );
    } catch (e) {
      if (!alive.current) return;
      const uncertain = !(e instanceof ApiError) || e.status >= 500;
      setChecking(uncertain);
      if (!uncertain) attempt.current = null;
      setError(
        uncertain
          ? "No se confirmó el resultado. Pulsa Comprobar envío; no se enviará dos veces la misma solicitud."
          : e instanceof Error
            ? e.message
            : "No se pudo enviar.",
      );
    } finally {
      busy.current = false;
      if (alive.current) setSending(false);
    }
  }
  return (
    <Stack gap="xs" p="md">
      <Text fw={600}>Responder por WhatsApp</Text>
      <Text size="xs" c="dimmed">
        Al responder, el bot queda pausado para que oficina continúe la
        conversación. Puedes reanudarlo desde el encabezado.
      </Text>
      {!open && (
        <Alert color="yellow">
          {enabled
            ? "La ventana de 24 horas terminó. El cliente debe escribir de nuevo para poder responder desde aquí."
            : "Las respuestas de oficina no están disponibles en este momento."}
        </Alert>
      )}
      <Textarea
        label="Mensaje para el cliente"
        placeholder="Escribe tu respuesta…"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        disabled={sending || checking || !open}
        maxLength={4000}
        minRows={3}
        autosize
      />
      <Button
        loading={sending}
        disabled={(!open && !checking) || !text.trim()}
        onClick={() => void send()}
      >
        {checking ? "Comprobar envío" : "Enviar por WhatsApp"}
      </Button>
      {error && (
        <Text role="alert" size="sm" c="red">
          {error}
        </Text>
      )}
    </Stack>
  );
}
