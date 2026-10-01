"use client";
import { useEffect, useState } from "react";
import { Alert, Button, Modal, Stack, Text, TextInput } from "@mantine/core";
import {
  IconBrandWhatsapp,
  IconMail,
  IconFileTypePdf,
} from "@tabler/icons-react";
import { createAnnexPdf, type AnnexExport } from "@/lib/annex-pdf";
export default function AnnexSend({
  data,
  onClose,
}: {
  data: AnnexExport | null;
  onClose: () => void;
}) {
  const [pdf, setPdf] = useState<Blob | null>(null),
    [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState(""),
    [email, setEmail] = useState("");
  useEffect(() => {
    let active = true;
    setPdf(null);
    setError(null);
    if (data)
      createAnnexPdf(data)
        .then((blob) => {
          if (active) setPdf(blob);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [data]);
  const download = () => {
    if (!pdf || !data) return;
    const url = URL.createObjectURL(pdf);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Anexo-${data.input.period.from}-${data.input.period.to}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const subject = data
    ? `Anexo de alquiler · ${data.worksite} · ${data.input.period.from} al ${data.input.period.to}`
    : "";
  const message = data
    ? `${subject}\nCliente: ${data.customer}\nRegistros hasta: ${data.input.period.through}\nDocumento para revisión. Alquiler sin IVA ni extras del operario.`
    : "";
  return (
    <Modal opened={!!data} onClose={onClose} title="Enviar anexo" size="md">
      <Stack>
        <Text size="sm">
          WhatsApp y correo abren un mensaje para que lo revises y envíes. Se
          descargará el PDF: adjúntalo al mensaje. No se envía automáticamente.
        </Text>
        {error ? <Alert color="red">{error}</Alert> : null}
        <TextInput
          label="WhatsApp del destinatario"
          placeholder="Código de país y número, ej. +57 3001234567"
          value={phone}
          onChange={(e) => setPhone(e.currentTarget.value)}
        />
        <Button
          color="green"
          leftSection={<IconBrandWhatsapp size={18} />}
          disabled={!pdf}
          onClick={() => {
            const number = phone.replace(/[\s()+-]/g, "");
            if (!/^\d{8,15}$/.test(number)) {
              setError("Escribe el número con código de país.");
              return;
            }
            setError(null);
            download();
            window.open(
              `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
              "_blank",
              "noopener,noreferrer",
            );
          }}
        >
          WhatsApp
        </Button>
        <TextInput
          label="Correo del destinatario"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
        />
        <Button
          leftSection={<IconMail size={18} />}
          disabled={!pdf}
          onClick={() => {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
              setError("Escribe un correo válido.");
              return;
            }
            setError(null);
            download();
            window.location.href = `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
          }}
        >
          Correo
        </Button>
        <Button
          variant="light"
          leftSection={<IconFileTypePdf size={18} />}
          loading={!pdf && !error}
          disabled={!pdf}
          onClick={download}
        >
          Descargar PDF
        </Button>
      </Stack>
    </Modal>
  );
}
