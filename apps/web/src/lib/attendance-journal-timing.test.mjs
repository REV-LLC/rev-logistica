import assert from "node:assert/strict";
import { test } from "node:test";
import { attendanceJournalTiming } from "./attendance-journal-timing.ts";
test("journey cards use API-reviewed dates and duration, not the original multi-day span", () => {
  const row = {
    enteredAt: "2026-11-14T12:00:00Z",
    leftAt: "2026-11-17T21:00:00Z",
    effective: {
      enteredAt: "2026-11-14T12:00:00Z",
      leftAt: "2026-11-14T21:00:00Z",
      hours: 9,
      corrected: true,
    },
  };
  assert.deepEqual(attendanceJournalTiming(row), row.effective);
  assert.equal(row.leftAt, "2026-11-17T21:00:00Z");
});
test("uncorrected and open records retain compatible display values", () => {
  assert.equal(
    attendanceJournalTiming({
      enteredAt: "2026-11-14T12:00:00Z",
      leftAt: "2026-11-14T21:00:00Z",
    }).hours,
    9,
  );
  assert.equal(
    attendanceJournalTiming({ enteredAt: "2026-11-14T12:00:00Z", leftAt: null })
      .hours,
    0,
  );
});
