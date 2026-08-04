"use client";

import {
  Alert,
  Button,
  FileInput,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconFileTypePdf, IconUpload } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";

export type MobilityGuideProvider = { id: string; name: string };

const localDate = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const addMonth = (value: string) => {
  const source = new Date(`${value}T12:00:00`);
  const day = source.getDate();
  source.setDate(1);
  source.setMonth(source.getMonth() + 1);
  source.setDate(
    Math.min(
      day,
      new Date(source.getFullYear(), source.getMonth() + 1, 0).getDate(),
    ),
  );
  return localDate(source);
};

export default function PublishProviderMobilityGuideModal({
  providers,
  opened,
  onClose,
  onPublished,
}: {
  providers: MobilityGuideProvider[];
  opened: boolean;
  onClose: () => void;
  onPublished: () => void;
}) {
  const today = useMemo(() => localDate(new Date()), []);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [machineReference, setMachineReference] = useState("");
  const [issuedAt, setIssuedAt] = useState(today);
  const [expiresAt, setExpiresAt] = useState(addMonth(today));
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetAndClose = () => {
    setProviderId(null);
    setMachineReference("");
    setIssuedAt(today);
    setExpiresAt(addMonth(today));
    setFile(null);
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (
      !providerId ||
      !machineReference.trim() ||
      !issuedAt ||
      !expiresAt ||
      !file
    ) {
      setError("Completa todos los campos y adjunta el PDF.");
      return;
    }
    if (file.type !== "application/pdf") {
      setError("La guia debe ser un archivo PDF.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("El PDF no puede superar 100 MB.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("providerId", providerId);
      body.append("machineReference", machineReference.trim());
      body.append("issuedAt", issuedAt);
      body.append("expiresAt", expiresAt);
      body.append("file", file);
      await api("/mobility-guides/provider-guides", { method: "POST", body });
      onPublished();
      resetAndClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo publicar la guia.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={resetAndClose}
      title="Publicar guia de proveedor"
      size="lg"
      centered
    >
      <Stack>
        <Text size="sm" c="dimmed">
          El archivo se renombrara automaticamente con el proveedor y la
          referencia de la maquina.
        </Text>
        {error ? <Alert color="red">{error}</Alert> : null}
        <Select
          searchable
          label="Proveedor"
          placeholder="Selecciona el proveedor"
          value={providerId}
          onChange={setProviderId}
          data={providers.map((provider) => ({
            value: provider.id,
            label: provider.name,
          }))}
          nothingFoundMessage="No hay proveedores disponibles"
          required
        />
        <TextInput
          label="Referencia de la maquina"
          placeholder="Ej. GENIE Z45"
          value={machineReference}
          onChange={(event) => setMachineReference(event.currentTarget.value)}
          maxLength={120}
          required
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput
            type="date"
            label="Fecha de expedicion"
            value={issuedAt}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setIssuedAt(value);
              if (value) setExpiresAt(addMonth(value));
            }}
            required
          />
          <TextInput
            type="date"
            label="Fecha de expiracion"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.currentTarget.value)}
            min={issuedAt}
            required
          />
        </SimpleGrid>
        <FileInput
          label="Documento PDF"
          description="Maximo 100 MB"
          accept="application/pdf"
          value={file}
          onChange={setFile}
          leftSection={<IconFileTypePdf size={17} />}
          placeholder="Selecciona la guia descargada"
          clearable
          required
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={resetAndClose}>
            Cancelar
          </Button>
          <Button
            leftSection={<IconUpload size={17} />}
            loading={saving}
            onClick={submit}
          >
            Publicar guia
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
