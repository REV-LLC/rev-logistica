"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Stack, Text } from "@mantine/core";
import { apiBlob } from "@/lib/api";

export default function WhatsappAudio({
  messageId,
  available,
}: {
  messageId: string;
  available: boolean;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [extension, setExtension] = useState("ogg");
  const alive = useRef(false);
  const objectUrl = useRef<string | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const blob = await apiBlob(
        `/whatsapp-reports/messages/${messageId}/audio`,
      );
      if (!alive.current) return;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob);
      setSource(objectUrl.current);
      setExtension(
        (
          {
            "audio/mp4": "m4a",
            "audio/mpeg": "mp3",
            "audio/aac": "aac",
            "audio/amr": "amr",
          } as Record<string, string>
        )[blob.type.split(";")[0]] ?? "ogg",
      );
    } catch {
      if (alive.current)
        setError(
          "No se pudo abrir el audio. Intenta de nuevo; si ya no está disponible, solicita que lo reenvíen.",
        );
    } finally {
      if (alive.current) setLoading(false);
    }
  }
  if (!available)
    return (
      <Text size="sm" c="dimmed" mt="xs">
        El archivo de este audio no quedó disponible. Solicita que lo reenvíen.
      </Text>
    );
  return (
    <Stack gap="xs" mt="xs" style={{ minWidth: 0 }}>
      {!source && (
        <Button
          variant="light"
          size="xs"
          loading={loading}
          onClick={() => void load()}
        >
          Escuchar audio
        </Button>
      )}
      {source && (
        <>
          <audio
            controls
            preload="metadata"
            src={source}
            style={{ width: "100%", maxWidth: "100%" }}
            onError={() =>
              setError(
                "Tu navegador no pudo reproducir este formato. Puedes descargar el audio para escucharlo.",
              )
            }
          />
          <Button
            component="a"
            href={source}
            download={`nota-de-voz.${extension}`}
            variant="subtle"
            size="xs"
          >
            Descargar audio
          </Button>
        </>
      )}
      {error && (
        <Text role="alert" size="sm" c="red">
          {error}
        </Text>
      )}
    </Stack>
  );
}
