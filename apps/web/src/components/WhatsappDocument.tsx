"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Group, Stack, Text } from "@mantine/core";
import { apiBlob } from "@/lib/api";
const extensions: Record<string, string> = {
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.ms-excel": "xls",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
};
export default function WhatsappDocument({
  messageId,
  available,
  filename,
}: {
  messageId: string;
  available: boolean;
  filename?: string | null;
}) {
  const [source, setSource] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [mime, setMime] = useState("");
  const alive = useRef(false),
    url = useRef<string | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const blob = await apiBlob(
        `/whatsapp-reports/messages/${messageId}/document`,
      );
      if (!alive.current) return;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(blob);
      setSource(url.current);
      setMime(blob.type.split(";")[0]);
    } catch {
      if (alive.current)
        setError(
          "No se pudo abrir el documento. Formatos: PDF, Word, Excel, PowerPoint o texto, hasta 20 MB. Intenta de nuevo o solicita que lo reenvíen.",
        );
    } finally {
      if (alive.current) setLoading(false);
    }
  }
  const base =
    (filename || "documento")
      .replace(/\.[^.]*$/, "")
      .replace(/[\\/\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, "")
      .slice(0, 100) || "documento";
  return (
    <Stack gap="xs" mt="xs">
      <Text size="sm" fw={500} style={{ overflowWrap: "anywhere" }}>
        {filename || "Documento"}
      </Text>
      {!available ? (
        <Text size="sm" c="dimmed">
          El archivo de este documento no quedó disponible. Solicita que lo
          reenvíen.
        </Text>
      ) : !source ? (
        <Button
          size="xs"
          variant="light"
          loading={loading}
          onClick={() => void load()}
        >
          Cargar documento
        </Button>
      ) : (
        <Group gap="xs">
          {mime === "application/pdf" && (
            <Button
              component="a"
              href={source}
              target="_blank"
              rel="noopener noreferrer"
              size="xs"
              variant="light"
            >
              Abrir PDF
            </Button>
          )}
          <Button
            component="a"
            href={source}
            download={`${base}.${extensions[mime] ?? "bin"}`}
            size="xs"
            variant="light"
          >
            Descargar documento
          </Button>
        </Group>
      )}
      {error && (
        <Text role="alert" size="sm" c="red">
          {error}
        </Text>
      )}
    </Stack>
  );
}
