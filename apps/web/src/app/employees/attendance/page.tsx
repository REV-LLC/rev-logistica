"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ActionIcon,
  Container,
  Group,
  Stack,
  Tabs,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";
import { attendanceEmployeeHref } from "@/lib/attendance-navigation";
import AttendanceEmployeeCards from "./components/AttendanceEmployeeCards";
import AttendancePunchReview from "./components/AttendancePunchReview";
import AttendanceSettingsModal from "./components/AttendanceSettingsModal";

export default function AttendanceAdmin() {
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<string | null>("shifts");
  const [settings, setSettings] = useState(false);
  const legacyEmployeeId = params.get("employeeId");
  const date = params.get("date"),
    from = params.get("from"),
    to = params.get("to");
  useEffect(() => {
    if (legacyEmployeeId)
      router.replace(
        attendanceEmployeeHref(legacyEmployeeId, {
          ...(date ? { date } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        }),
      );
  }, [legacyEmployeeId, date, from, to, router]);
  return (
    <Container size="lg" py="md">
      <Stack>
        <Group
          data-page-heading-glass
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
          }}
          justify="space-between"
          align="start"
          wrap="nowrap"
        >
          <div style={{ minWidth: 0 }}>
            <Title order={1}>Asistencia y rostros</Title>
            <Text c="dimmed">Entradas y salidas de WhatsApp y PWA.</Text>
          </div>
          <Tooltip label="Ajustes de asistencia">
            <ActionIcon
              aria-label="Ajustes de asistencia"
              variant="light"
              size="lg"
              onClick={() => setSettings(true)}
              style={{ flexShrink: 0 }}
            >
              <IconSettings size={22} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Tabs value={tab} onChange={setTab}>
          <Tabs.List>
            <Tabs.Tab value="shifts">Entradas y salidas</Tabs.Tab>
            <Tabs.Tab value="punches">Revisión de marcaciones</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="shifts" pt="md">
            {tab === "shifts" && !legacyEmployeeId ? (
              <AttendanceEmployeeCards
                key={`${from ?? ""}:${to ?? ""}`}
                initialFrom={from}
                initialTo={to}
              />
            ) : null}
          </Tabs.Panel>
          <Tabs.Panel value="punches" pt="md">
            {tab === "punches" ? <AttendancePunchReview /> : null}
          </Tabs.Panel>
        </Tabs>
        {settings ? (
          <AttendanceSettingsModal onClose={() => setSettings(false)} />
        ) : null}
      </Stack>
    </Container>
  );
}
