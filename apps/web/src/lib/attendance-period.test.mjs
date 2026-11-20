import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  attendancePresetRange,
  attendanceDayTitle,
} from "./attendance-period.ts";
test("last fifteen days includes today and crosses calendar boundaries", () => {
  for (const [today, from] of [["2026-11-20", "2026-11-06"], ["2026-03-05", "2026-02-19"], ["2027-01-05", "2026-12-22"], ["2024-03-05", "2024-02-20"]]) {
    assert.deepEqual(attendancePresetRange("last15", today), { from, to: today });
  }
});
test("worker journeys default to fifteen days and dashboard links send the same range", () => {
  const cards = readFileSync(new URL("../app/employees/attendance/components/AttendanceEmployeeCards.tsx", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../components/dashboard/AttendanceCard.tsx", import.meta.url), "utf8");
  assert.match(cards, /requestedRange \?\? presetRange\(initialEmployeeId \? "last15" : "month"\)/);
  assert.match(cards, /value: "last15", label: "Últimos 15 días"/);
  assert.match(dashboard, /attendanceEmployeeHref\(employee.id, attendancePresetRange\('last15', report.date\)\)/);
});
test("this month includes every calendar day, including leap years and year-end", () => {
  assert.deepEqual(attendancePresetRange("month", "2026-11-13"), {
    from: "2026-11-01",
    to: "2026-11-30",
  });
  assert.deepEqual(attendancePresetRange("month", "2024-02-15"), {
    from: "2024-02-01",
    to: "2024-02-29",
  });
  assert.deepEqual(attendancePresetRange("month", "2026-12-31"), {
    from: "2026-12-01",
    to: "2026-12-31",
  });
});
test("journey headings use the entry day in Colombia, even across UTC midnight", () => {
  assert.equal(attendanceDayTitle("2026-11-13T12:00:00Z"), "NOV 13");
  assert.equal(attendanceDayTitle("2026-11-14T04:30:00Z"), "NOV 13");
  assert.equal(attendanceDayTitle("2027-01-01T04:30:00Z"), "DIC 31");
});
