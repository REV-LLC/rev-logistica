"use client";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Group,
  Image,
  Loader,
  Modal,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { apiBlob } from "@/lib/api";

export default function AttendanceEvidencePhoto({
  fileId,
  label,
}: {
  fileId: string;
  label: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [originalFailed, setOriginalFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false,
      url: string | undefined;
    setFailed(false);
    setThumbnail(null);
    void apiBlob(`/files/${fileId}/thumbnail`)
      .then((blob) => {
        if (!cancelled) {
          url = URL.createObjectURL(blob);
          setThumbnail(url);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [visible, fileId, retry]);
  useEffect(() => {
    if (!opened) return;
    let cancelled = false,
      url: string | undefined;
    setOriginalFailed(false);
    setOriginal(null);
    void apiBlob(`/files/${fileId}/download`)
      .then((blob) => {
        if (!cancelled) {
          url = URL.createObjectURL(blob);
          setOriginal(url);
        }
      })
      .catch(() => {
        if (!cancelled) setOriginalFailed(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [opened, fileId]);
  return (
    <Box ref={container} mih={100}>
      {thumbnail && !failed ? (
        <UnstyledButton
          w="100%"
          aria-label={`Ampliar ${label.toLowerCase()}`}
          onClick={() => setOpened(true)}
        >
          <Image
            src={thumbnail}
            alt={label}
            mah={230}
            fit="contain"
            radius="sm"
            onError={() => setFailed(true)}
          />
        </UnstyledButton>
      ) : failed ? (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            No se pudo cargar la vista previa.
          </Text>
          <Group>
            <Button
              size="xs"
              variant="light"
              onClick={() => setRetry((v) => v + 1)}
            >
              Reintentar foto
            </Button>
            <Button size="xs" variant="subtle" onClick={() => setOpened(true)}>
              Abrir foto
            </Button>
          </Group>
        </Stack>
      ) : (
        <Group mih={100} justify="center">
          <Loader size="sm" aria-label="Cargando vista previa" />
        </Group>
      )}
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={label}
        size="xl"
      >
        {originalFailed ? (
          <Alert color="red">
            No se pudo abrir la evidencia. Cierra y vuelve a intentar.
          </Alert>
        ) : original ? (
          <Image
            src={original}
            alt={`${label} ampliada`}
            fit="contain"
            mah="75vh"
          />
        ) : (
          <Loader aria-label="Cargando evidencia" />
        )}
      </Modal>
    </Box>
  );
}
