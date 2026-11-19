"use client";

import { Badge, Button, Group, Paper, Stack, Text } from "@mantine/core";
import {
  EmployeeCardIdentity,
  getEmployeeCardFullName,
} from "@/components/EmployeeCard";
import { attendanceShortDate } from "@/lib/attendance";
import type { AttendanceEmployee } from "./attendance-types";
import styles from "./AttendanceEmployeeCard.module.css";

export default function AttendanceEmployeeCard({
  employee,
  onSelect,
}: {
  employee: AttendanceEmployee;
  onSelect: (employeeId: string) => void;
}) {
  const name = getEmployeeCardFullName(employee);
  const worksite =
    employee.latestWorksite ?? "Sin obra reportada en el período";
  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      className={styles.card}
      component="article"
      aria-label={`Asistencia de ${name}`}
    >
      <Stack gap="xs" className={styles.content}>
        <div className={styles.identity}>
          <EmployeeCardIdentity
            employee={employee}
            photoSize={48}
            nameLines={2}
          />
          {!employee.active ? <Badge color="gray">Inactivo</Badge> : null}
        </div>
        <Text
          size="sm"
          c="dimmed"
          lineClamp={2}
          className={styles.worksite}
          title={worksite}
        >
          {worksite}
        </Text>
        <Group gap={6} className={styles.badges}>
          <Badge variant="light">{employee.journeys} jornadas</Badge>
          {employee.open ? (
            <Badge color="orange">{employee.open} sin salida</Badge>
          ) : null}
          {employee.pendingReview ? (
            <Badge color="yellow">{employee.pendingReview} por revisar</Badge>
          ) : null}
        </Group>
        <Text size="sm" className={styles.hours} lineClamp={2}>
          {employee.reportedHours.toFixed(2)} h de presencia reportada
        </Text>
        <Text size="xs" c="dimmed" className={styles.dates} lineClamp={2}>
          {employee.lastEntry ? (
            <>
              Última entrada: {attendanceShortDate(employee.lastEntry)}
              {employee.lastExit
                ? ` · Salida: ${attendanceShortDate(employee.lastExit)}`
                : ""}
            </>
          ) : (
            "Sin reportes. No se interpreta como ausencia."
          )}
        </Text>
        <Button
          variant="light"
          aria-label={`Ver jornadas de ${name}`}
          onClick={() => onSelect(employee.id)}
        >
          Ver jornadas
        </Button>
      </Stack>
    </Paper>
  );
}
