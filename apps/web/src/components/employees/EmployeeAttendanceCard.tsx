"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import {
  attendanceCalendarDate,
  attendanceCalendarDays,
  attendanceCalendarStatusLabel,
  attendanceCalendarTime,
  shiftAttendanceMonth,
  validAttendanceMonth,
  type AttendanceCalendarMode,
  type AttendanceCalendarDay,
} from "@/lib/attendance-calendar";
import { loadAttendanceCalendar } from "@/lib/attendance-calendar-data";
import { getEmployeeCardFullName } from "@/components/EmployeeCard";
import AttendanceReportReviewModal from "@/app/employees/attendance/components/AttendanceReportReviewModal";
import type {
  AttendanceEmployee,
  AttendanceJournal,
} from "@/app/employees/attendance/components/attendance-types";
import styles from "./EmployeeAttendanceCard.module.css";

type Identity = Pick<AttendanceEmployee, "id" | "name" | "lastName">;
type CalendarData = Awaited<ReturnType<typeof loadAttendanceCalendar>>;
const monthFormat = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});
const shortMonthFormat = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  month: "short",
});
const dayFormat = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
});
const tooltipDateFormat = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default function EmployeeAttendanceCard({
  employee,
}: {
  employee: Identity;
}) {
  const today = attendanceCalendarDate(new Date());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [mode, setMode] = useState<AttendanceCalendarMode>("entry");
  const [selectedDate, setSelectedDate] = useState(today);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<{
    key: string;
    result: CalendarData;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [reviewing, setReviewing] = useState<AttendanceJournal | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [notice, setNotice] = useState("");
  const key = `${employee.id}:${month}:${revision}`;
  const ready = data?.key === key ? data.result : null;
  const error = failure?.key === key ? failure.message : "";
  const days = useMemo(
    () =>
      ready
        ? attendanceCalendarDays(month, ready.journals, ready.schedule, mode)
        : [],
    [ready, month, mode],
  );
  const selected = days.find((day) => day.date === selectedDate) ?? days[0];
  const { id, name, lastName } = employee;
  useEffect(() => {
    const controller = new AbortController();
    void loadAttendanceCalendar(id, month, controller.signal, {
      id,
      name,
      lastName,
    })
      .then((result) => {
        if (!controller.signal.aborted) setData({ key, result });
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setFailure({
            key,
            message:
              cause instanceof Error
                ? cause.message
                : "No se pudo cargar la asistencia.",
          });
      });
    return () => controller.abort();
  }, [id, name, lastName, month, key]);
  function changeMonth(value: string) {
    if (!validAttendanceMonth(value)) return;
    setMonth(value);
    setSelectedDate(`${value}-01`);
    setNotice("");
    setChoosing(false);
  }
  function reviewDay(day: AttendanceCalendarDay) {
    setSelectedDate(day.date);
    if (!day.events.length) return;
    if (day.events.length === 1) setReviewing(day.events[0].journal);
    else setChoosing(true);
  }
  const title = monthFormat.format(new Date(`${month}-01T12:00:00Z`));
  const content = (
    <>
      <div className={styles.navigation}>
        <Tooltip label={title}>
          <Text
            component="span"
            className={styles.monthLabel}
            aria-label={title}
            aria-live="polite"
          >
            {shortMonthFormat
              .format(new Date(`${month}-01T12:00:00Z`))
              .replace(/\.$/, "")
              .toUpperCase()}
          </Text>
        </Tooltip>
      </div>
      {error ? (
        <Alert color="red" title="No se pudo cargar el mes">
          <Text size="sm">{error}</Text>
          <Button
            size="xs"
            variant="subtle"
            onClick={() => setRevision((value) => value + 1)}
          >
            Reintentar
          </Button>
        </Alert>
      ) : !ready ? (
        <div className={styles.loading}>
          <Loader size="sm" aria-label="Cargando asistencia del mes" />
        </div>
      ) : (
        <>
          <div className={styles.grid} role="group" aria-label={title}>
            {days.map((day) => (
              <Tooltip
                key={day.date}
                label={tooltipDateFormat.format(
                  new Date(`${day.date}T12:00:00Z`),
                )}
                withArrow
                position="top-end"
                multiline
                w={240}
                openDelay={120}
                events={{ hover: true, focus: true, touch: true }}
              >
                <button
                  type="button"
                  className={styles.day}
                  data-status={day.status}
                  aria-pressed={selected?.date === day.date}
                  aria-current={day.date === today ? "date" : undefined}
                  aria-label={`${dayFormat.format(new Date(`${day.date}T12:00:00Z`))}. ${mode === "entry" ? "Entrada" : "Salida"}: ${day.time ?? "sin registro"}. ${attendanceCalendarStatusLabel(day.status, mode)}.${day.events.length > 1 ? ` ${day.events.length} registros.` : ""}`}
                  onClick={() => reviewDay(day)}
                >
                  <span className={styles.clock}>{day.time ?? "—"}</span>
                </button>
              </Tooltip>
            ))}
          </div>
        </>
      )}
    </>
  );
  return (
    <>
      <section className={styles.card} aria-label="Asistencia del empleado">
        <Tabs
          value={mode}
          onChange={(value) => {
            if (value === "entry" || value === "exit") setMode(value);
          }}
          keepMounted={false}
        >
          <div className={styles.header}>
            <Tooltip label="Mes anterior">
              <ActionIcon
                aria-label="Mes anterior"
                size={30}
                variant="subtle"
                disabled={month === "1000-01"}
                onClick={() => changeMonth(shiftAttendanceMonth(month, -1))}
              >
                <IconChevronLeft size={17} />
              </ActionIcon>
            </Tooltip>
            <Tabs.List className={styles.tabs}>
              <Tabs.Tab value="entry">Entrada</Tabs.Tab>
              <Tabs.Tab value="exit">Salida</Tabs.Tab>
            </Tabs.List>
            <Tooltip label="Mes siguiente">
              <ActionIcon
                aria-label="Mes siguiente"
                size={30}
                variant="subtle"
                disabled={month === "9999-12"}
                onClick={() => changeMonth(shiftAttendanceMonth(month, 1))}
              >
                <IconChevronRight size={17} />
              </ActionIcon>
            </Tooltip>
          </div>
          {(["entry", "exit"] as const).map((tab) => (
            <Tabs.Panel key={tab} value={tab}>
              {mode === tab ? content : null}
            </Tabs.Panel>
          ))}
        </Tabs>
        {notice ? (
          <Text size="xs" c="green" role="status">
            {notice}
          </Text>
        ) : null}
      </section>
      <Modal
        opened={choosing && Boolean(selected)}
        onClose={() => setChoosing(false)}
        title="Registros del día"
        centered
        size="sm"
      >
        <Stack gap="sm">
          {selected?.events.map((event) => (
            <Group key={event.journal.id} justify="space-between" wrap="nowrap">
              <div>
                <Text size="sm">{attendanceCalendarTime(event.at)}</Text>
                <Text size="xs" c="dimmed">
                  {event.journal.customerWorksite.worksite.name}
                </Text>
              </div>
              <Button
                size="xs"
                variant="light"
                onClick={() => {
                  setChoosing(false);
                  setReviewing(event.journal);
                }}
              >
                Revisar
              </Button>
            </Group>
          ))}
        </Stack>
      </Modal>
      {reviewing ? (
        <AttendanceReportReviewModal
          journal={reviewing}
          employeeId={id}
          employeeName={getEmployeeCardFullName(employee)}
          onClose={() => setReviewing(null)}
          onReviewed={() => {
            setReviewing(null);
            setRevision((value) => value + 1);
            setNotice("Revisión guardada correctamente.");
          }}
        />
      ) : null}
    </>
  );
}
