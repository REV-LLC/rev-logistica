import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { workScheduleError, workScheduleMinutes } from "./work-schedule.ts";

const fixture = () => ({
  days: [
    {
      dayOfWeek: 1,
      periods: [
        { start: "07:00", end: "12:00" },
        { start: "13:00", end: "16:00" },
      ],
    },
    ...[2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      periods: [
        { start: "07:30", end: "12:00" },
        { start: "13:00", end: "16:00" },
      ],
    })),
    { dayOfWeek: 6, periods: [{ start: "07:00", end: "11:00" }] },
    { dayOfWeek: 7, periods: [] },
  ],
});
test("REV weekly hours exclude lunch and non-working Sunday", () => {
  assert.equal(workScheduleError(fixture()), null);
  assert.equal(workScheduleMinutes(fixture()), 42 * 60);
});
test("incomplete, reversed and overlapping times cannot be saved", () => {
  for (const periods of [
    [{ start: "", end: "12:00" }],
    [{ start: "16:00", end: "07:00" }],
    [
      { start: "07:00", end: "12:00" },
      { start: "11:00", end: "16:00" },
    ],
  ]) {
    const schedule = fixture();
    schedule.days[0].periods = periods;
    assert.ok(workScheduleError(schedule));
  }
});
test("days off and additional valid periods remain configurable", () => {
  const schedule = fixture();
  schedule.days[6].periods = [{ start: "09:00", end: "11:00" }];
  assert.equal(workScheduleError(schedule), null);
  assert.equal(workScheduleMinutes(schedule), 44 * 60);
});
test("schedule editor uses persisted data and protects unsaved changes in the settings modal", () => {
  const modal = readFileSync(
    new URL(
      "../app/employees/attendance/components/AttendanceSettingsModal.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const editor = readFileSync(
    new URL(
      "../app/employees/attendance/components/AttendanceWorkSchedule.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(modal, /Horario de REV/);
  assert.match(modal, /scheduleState.dirty.*window.confirm/s);
  assert.match(modal, /keepMounted=\{false\}/);
  assert.match(editor, /json: \{ schedule: draft \}/);
  assert.match(editor, /setSaved\(result\);\s+setDraft\(result.schedule\)/);
  assert.doesNotMatch(editor, /DEFAULT_WORK_SCHEDULE/);
});
