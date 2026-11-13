import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attendancePresetRange,
  attendanceDayTitle,
} from "./attendance-period.ts";
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
