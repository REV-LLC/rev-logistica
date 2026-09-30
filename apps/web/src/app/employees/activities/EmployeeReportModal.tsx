"use client";
import {
  Alert,
  Button,
  Group,
  Modal,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import { IconBeach, IconFirstAidKit, IconX } from "@tabler/icons-react";
import { activityColors, type ActivityForm } from "./activity-types";

export default function EmployeeReportModal({
  opened,
  editing,
  employeeName,
  form,
  onChange,
  onClose,
  onSave,
  saving,
  error,
}: {
  opened: boolean;
  editing: boolean;
  employeeName: string;
  form: ActivityForm;
  onChange: (form: ActivityForm) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
}) {
  const vacation = form.type === "VACATION";
  const color = activityColors[form.type];
  const days =
    form.date && form.endDate
      ? Math.round(
          (Date.parse(form.endDate) - Date.parse(form.date)) / 86400000,
        ) + 1
      : 0;
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text size="lg" fw={750}>
          {editing
            ? "Editar reporte"
            : vacation
              ? "Reportar vacaciones"
              : "Reportar falta o incapacidad"}
        </Text>
      }
      size="md"
      centered
      radius="lg"
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      withCloseButton={!saving}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <Stack gap="md">
          <Paper radius="md" p="md" bg={`${color}.0`}>
            <Group wrap="nowrap">
              <ThemeIcon size={48} radius="md" variant="light" color={color}>
                {vacation ? (
                  <IconBeach size={26} />
                ) : form.type === "ABSENCE" ? (
                  <IconX size={26} stroke={2.5} />
                ) : (
                  <IconFirstAidKit size={26} />
                )}
              </ThemeIcon>
              <div>
                <Text fw={700}>{employeeName}</Text>
                <Text size="sm" c="dimmed">
                  {vacation
                    ? "Registra su período de vacaciones."
                    : "Registra la novedad de asistencia."}
                </Text>
              </div>
            </Group>
          </Paper>
          {error ? <Alert color="red">{error}</Alert> : null}
          {!vacation ? (
            <Stack gap={6}>
              <Text size="sm" fw={500}>
                Tipo de reporte
              </Text>
              <SegmentedControl
                color={form.type === "ABSENCE" ? "red" : undefined}
                aria-label="Tipo de reporte"
                fullWidth
                disabled={saving}
                value={form.type}
                data={[
                  { value: "ABSENCE", label: "Falta" },
                  { value: "MEDICAL_LEAVE", label: "Incapacidad" },
                ]}
                onChange={(type) =>
                  onChange({
                    ...form,
                    type: type as "ABSENCE" | "MEDICAL_LEAVE",
                  })
                }
              />
            </Stack>
          ) : null}
          <SimpleGrid cols={{ base: 1, xs: 2 }}>
            <TextInput
              type="date"
              label="Fecha de inicio"
              required
              disabled={saving}
              value={form.date}
              onChange={(event) => {
                const date = event.currentTarget.value;
                onChange({
                  ...form,
                  date,
                  endDate:
                    !form.endDate || form.endDate < date ? date : form.endDate,
                });
              }}
            />
            <TextInput
              type="date"
              label="Fecha de fin"
              required
              min={form.date || undefined}
              disabled={saving}
              value={form.endDate}
              onChange={(event) =>
                onChange({ ...form, endDate: event.currentTarget.value })
              }
            />
          </SimpleGrid>
          {days > 0 ? (
            <Text size="sm" c={color} fw={600}>
              {days} {days === 1 ? "día calendario" : "días calendario"} ·
              Incluye inicio y fin
            </Text>
          ) : null}
          <Textarea
            label={vacation ? "Observaciones" : "Motivo u observaciones"}
            placeholder={
              vacation
                ? "Añade algún detalle del período (opcional)…"
                : "Describe el motivo o la novedad que quieres registrar…"
            }
            required={!vacation}
            autosize
            minRows={4}
            maxRows={8}
            maxLength={5000}
            value={form.description}
            disabled={saving}
            onChange={(event) =>
              onChange({ ...form, description: event.currentTarget.value })
            }
          />
          <Group justify="end">
            <Button variant="default" disabled={saving} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" color={color} loading={saving}>
              Guardar reporte
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
