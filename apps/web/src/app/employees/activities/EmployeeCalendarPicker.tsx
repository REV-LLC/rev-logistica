"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Group,
  Popover,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { IconCheck, IconChevronDown, IconSearch } from "@tabler/icons-react";
import EmployeeAvatar, {
  useEmployeePhotoUrl,
} from "@/components/EmployeeAvatar";
import AppAvatar from "@/components/AppAvatar";
import { useMediaQuery } from "@mantine/hooks";
import styles from "./activities.module.css";

export type CalendarEmployee = {
  id: string;
  name: string;
  lastName: string;
  active: boolean;
};
const nameOf = (employee: CalendarEmployee) =>
  `${employee.name} ${employee.lastName}`.trim();
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function CalendarPortrait({
  employee,
  large,
}: {
  employee: CalendarEmployee;
  large: boolean;
}) {
  const photoUrl = useEmployeePhotoUrl(employee.id, 0, large);
  const size = large ? 96 : 48;
  return (
    <AppAvatar
      src={photoUrl}
      size={size}
      imageSizes={`${size}px`}
      radius={large ? 20 : "xl"}
      color="blue"
      alt={nameOf(employee)}
    >{`${employee.name[0] ?? ""}${employee.lastName[0] ?? ""}`}</AppAvatar>
  );
}

export default function EmployeeCalendarPicker({
  employees,
  employee,
  onChange,
  disabled,
}: {
  employees: CalendarEmployee[];
  employee?: CalendarEmployee;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const largeScreen = useMediaQuery("(min-width: 1600px)");
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () =>
      employees.filter((person) =>
        normalize(nameOf(person)).includes(normalize(search.trim())),
      ),
    [employees, search],
  );

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      width={580}
      withArrow
      shadow="lg"
      radius="lg"
      trapFocus
      returnFocus
      styles={{ dropdown: { maxWidth: "calc(100vw - 32px)" } }}
    >
      <Popover.Target>
        <UnstyledButton
          className={styles.employeeTrigger}
          disabled={disabled || !employees.length}
          aria-label={`Cambiar empleado${employee ? `: ${nameOf(employee)}` : ""}`}
          aria-haspopup="dialog"
          aria-expanded={opened}
          onClick={() => {
            setSearch("");
            setOpened(!opened);
          }}
        >
          <Group wrap="nowrap" gap="sm">
            {employee ? (
              <CalendarPortrait
                employee={employee}
                large={Boolean(largeScreen)}
              />
            ) : null}
            <div className={styles.employeeName}>
              <Text
                fw={700}
                className={styles.employeeTriggerName}
                title={employee ? nameOf(employee) : undefined}
              >
                {employee ? nameOf(employee) : "Selecciona un empleado"}
              </Text>
              <Text className={styles.employeeTriggerHint} c="dimmed">
                Cambiar empleado
              </Text>
            </div>
            <IconChevronDown
              size={18}
              className={styles.employeeChevron}
              aria-hidden="true"
            />
          </Group>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown
        role="dialog"
        aria-label="Seleccionar empleado"
        aria-labelledby=""
        p="md"
      >
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={750}>Elige un empleado</Text>
            <Badge variant="light" color="orange">
              {employees.length} empleados
            </Badge>
          </Group>
          <TextInput
            aria-label="Buscar empleado"
            placeholder="Buscar por nombre o apellido…"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          <ScrollArea.Autosize
            mah="min(440px, 55vh)"
            type="auto"
            offsetScrollbars
          >
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              {filtered.map((person) => (
                <UnstyledButton
                  key={person.id}
                  className={`${styles.employeeOption} ${employee?.id === person.id ? styles.employeeOptionSelected : ""}`}
                  aria-label={`Ver calendario de ${nameOf(person)}`}
                  aria-pressed={employee?.id === person.id}
                  onClick={() => {
                    onChange(person.id);
                    setOpened(false);
                  }}
                >
                  <Group gap="sm" wrap="nowrap">
                    <EmployeeAvatar employee={person} size={44} />
                    <div className={styles.employeeName}>
                      <Text size="sm" fw={650}>
                        {nameOf(person)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {person.active ? "Activo" : "Inactivo"}
                      </Text>
                    </div>
                    {employee?.id === person.id ? (
                      <IconCheck size={18} color="#ed751a" aria-hidden="true" />
                    ) : null}
                  </Group>
                </UnstyledButton>
              ))}
            </SimpleGrid>
            {!filtered.length ? (
              <Text size="sm" c="dimmed" ta="center" p="lg">
                No se encontraron empleados.
              </Text>
            ) : null}
          </ScrollArea.Autosize>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
