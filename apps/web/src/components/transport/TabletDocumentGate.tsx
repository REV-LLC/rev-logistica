"use client";

import {
  Alert,
  Button,
  Container,
  Group,
  Paper,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useState } from "react";
import { api } from "@/lib/api";
import { getCurrentUserRole } from "@/lib/auth";
import TransportRequestsWorkspace from "./TransportRequestsWorkspace";

export type TabletEmployeeContext = {
  token: string;
  expiresAt: string;
  employee: { id: string; name: string };
  warehouseId: string;
};

export default function TabletDocumentGate() {
  const [context, setContext] = useState<TabletEmployeeContext | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isTablet = getCurrentUserRole() === "WAREHOUSE_TABLET";
  if (!isTablet) return <TransportRequestsWorkspace mode="generate" />;
  const reset = () => {
    window.history.replaceState({}, "", "/transport/generate");
    setContext(null);
    setPin("");
    setError(null);
  };
  if (context)
    return (
      <TransportRequestsWorkspace
        mode="generate"
        tabletEmployee={context}
        onTabletReset={reset}
        onTabletReidentify={() => {
          setContext(null);
          setPin("");
          setError(null);
        }}
      />
    );

  const identify = async () => {
    if (busy || pin.length !== 4) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams(window.location.search);
      const documentId = params.get("draft");
      const verified = await api<TabletEmployeeContext>(
        "/warehouse-tablets/identify",
        {
          method: "POST",
          json: { pin, ...(documentId ? { documentId } : {}) },
        },
      );
      setPin("");
      setContext(verified);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo verificar el PIN. Revisa la conexión.",
      );
      setPin("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Container size={420} py="xl">
      <Paper withBorder radius="lg" p="xl">
        <Stack>
          <Title order={2} ta="center">
            ¿Quién realiza el documento?
          </Title>
          <Text c="dimmed" ta="center">
            Ingresa tu PIN personal de 4 dígitos para iniciar o retomar una
            remisión o devolución.
          </Text>
          {error ? (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          ) : null}
          <PasswordInput
            label="PIN del empleado"
            value={pin}
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            disabled={busy}
            onChange={(event) =>
              setPin(event.currentTarget.value.replace(/\D/g, "").slice(0, 4))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") void identify();
            }}
            styles={{
              input: { textAlign: "center", fontSize: 28, letterSpacing: 12 },
            }}
          />
          <SimpleGrid cols={3} spacing="sm">
            {[
              "1",
              "2",
              "3",
              "4",
              "5",
              "6",
              "7",
              "8",
              "9",
              "Borrar",
              "0",
              "←",
            ].map((key) => (
              <Button
                key={key}
                h={64}
                size="xl"
                variant="light"
                disabled={busy}
                aria-label={key === "←" ? "Borrar último dígito" : key}
                onClick={() =>
                  setPin((value) =>
                    key === "Borrar"
                      ? ""
                      : key === "←"
                        ? value.slice(0, -1)
                        : `${value}${key}`.slice(0, 4),
                  )
                }
              >
                {key === "Borrar" ? "C" : key}
              </Button>
            ))}
          </SimpleGrid>
          <Button
            size="lg"
            loading={busy}
            disabled={pin.length !== 4}
            onClick={() => void identify()}
          >
            Continuar
          </Button>
          <Group justify="center">
            <Button variant="subtle" disabled={busy} onClick={reset}>
              Empezar otro documento
            </Button>
          </Group>
          <Text size="xs" c="dimmed" ta="center">
            Si no tienes PIN, solicítalo a administración.
          </Text>
        </Stack>
      </Paper>
    </Container>
  );
}
