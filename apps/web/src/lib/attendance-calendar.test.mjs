import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  loadTransportModule,
} = require("../components/transport/test-support.cjs");
const model = loadTransportModule(
  new URL("./attendance-calendar.ts", import.meta.url).pathname,
);
const schedule = {
  days: Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i + 1,
    periods:
      i === 6
        ? []
        : [
            {
              start: i === 0 || i === 5 ? "07:00" : "07:30",
              end: i === 5 ? "11:00" : "16:00",
            },
          ],
  })),
};
const journal = (id, enteredAt, leftAt = null, extra = {}) => ({
  id,
  enteredAt,
  leftAt,
  activityNote: null,
  checkOutReportId: null,
  checkInReport: null,
  checkOutReport: null,
  ...extra,
});
const days = (rows, mode = "entry", month = "2026-11") =>
  model.attendanceCalendarDays(month, rows, schedule, mode);

test("calendar ranges validate months, retain leap days and shift across years", () => {
  assert.deepEqual(model.attendanceMonthRange("2024-02"), {
    from: "2024-02-01",
    to: "2024-02-29",
  });
  assert.equal(model.shiftAttendanceMonth("2026-12", 1), "2027-01");
  assert.equal(model.shiftAttendanceMonth("2026-01", -1), "2025-12");
  assert.throws(() => model.attendanceMonthRange("2026-13"));
  assert.throws(() => model.attendanceMonthRange("not-a-month"));
});
test("arrivals are late from exactly five minutes, not five minutes inclusive of a grace minute", () => {
  for (const [time, expected] of [
    ["07:29:59", "early"],
    ["07:30:00", "on-time"],
    ["07:34:59", "on-time"],
    ["07:35:00", "late"],
    ["08:00:00", "late"],
  ]) {
    assert.equal(
      days([journal("j", `2026-11-17T${time}-05:00`)])[16].status,
      expected,
    );
  }
  assert.equal(
    days([journal("m", "2026-11-16T07:05:00-05:00")])[15].status,
    "late",
  );
  assert.equal(
    days([journal("s", "2026-11-14T07:05:00-05:00")])[13].status,
    "late",
  );
});
test("exit view uses only exits and the exit schedule, not the arrival punctuality", () => {
  const rows = [
    journal(
      "late-entry",
      "2026-11-17T08:00:00-05:00",
      "2026-11-17T16:07:00-05:00",
    ),
  ];
  assert.equal(days(rows)[16].status, "late");
  assert.equal(days(rows, "exit")[16].status, "early");
  assert.equal(days(rows, "exit")[16].time, "16:07");
  assert.equal(
    days([journal("open", "2026-11-17T07:30:00-05:00")], "exit")[16].time,
    null,
  );
  assert.equal(
    days(
      [
        journal(
          "sat",
          "2026-11-14T07:00:00-05:00",
          "2026-11-14T10:59:00-05:00",
        ),
      ],
      "exit",
    )[13].status,
    "late",
  );
});
test("reviewed dates and hours replace original timing in the correct calendar day", () => {
  const corrected = journal(
    "j",
    "2026-11-14T12:06:00Z",
    "2026-11-17T21:32:00Z",
    {
      effective: {
        enteredAt: "2026-11-14T12:06:00Z",
        leftAt: "2026-11-14T21:00:00Z",
        hours: 8.9,
        corrected: true,
      },
    },
  );
  assert.equal(days([corrected], "exit")[13].time, "16:00");
  assert.equal(days([corrected], "exit")[16].time, null);
  assert.equal(corrected.leftAt, "2026-11-17T21:32:00Z");
});
test("Colombia dates handle UTC midnight, overnight exits and month boundaries", () => {
  assert.equal(
    model.attendanceCalendarDate("2026-11-18T04:30:00Z"),
    "2026-11-17",
  );
  assert.equal(model.attendanceCalendarTime("2026-11-18T05:00:00Z"), "00:00");
  const crossMonth = journal(
    "night",
    "2026-10-31T23:00:00-05:00",
    "2026-11-01T01:00:00-05:00",
  );
  assert.equal(days([crossMonth])[0].time, null);
  assert.equal(days([crossMonth], "exit")[0].time, "01:00");
  assert.equal(
    days([crossMonth], "exit")[0].events[0].scheduledAt,
    "2026-10-31T11:00:00-05:00",
  );
});
test("multiple registrations retain every journal; first entry and final exit are representative", () => {
  const rows = [
    journal(
      "afternoon",
      "2026-11-17T13:00:00-05:00",
      "2026-11-17T16:00:00-05:00",
    ),
    journal(
      "morning",
      "2026-11-17T07:28:00-05:00",
      "2026-11-17T12:00:00-05:00",
    ),
  ];
  assert.equal(days(rows)[16].time, "07:28");
  assert.equal(days(rows, "exit")[16].time, "16:00");
  assert.equal(days(rows)[16].events.length, 2);
});
test("days off, missing registrations and invalid evidence never pretend to be late arrivals", () => {
  assert.equal(days([])[0].status, "off");
  assert.equal(days([])[1].status, "empty");
  assert.equal(
    days([
      journal("j", "2026-11-17T08:00:00-05:00", null, {
        checkInReport: { deletedAt: "2026-11-18" },
      }),
    ])[16].status,
    "review",
  );
  assert.equal(
    days([
      journal("j", "2026-11-17T08:00:00-05:00", null, {
        activityNote: {
          reviewStatus: "CONFIRMED",
          reviewedSourceExitId: "old",
        },
        checkOutReportId: "new",
      }),
    ])[16].status,
    "review",
  );
});

function dataLoader(mock) {
  return loadTransportModule(
    new URL("./attendance-calendar-data.ts", import.meta.url).pathname,
    { "./api": { api: mock } },
  ).loadAttendanceCalendar;
}
test("calendar fetches all pages, deduplicates IDs and uses the full month", async () => {
  const calls = [];
  const loader = dataLoader(async (path, options) => {
    calls.push(path);
    assert.ok(options.signal);
    if (path === "/settings/work-schedule") return { schedule };
    if (path.startsWith("/whatsapp-reports/attendance/employees?"))
      return { employees: [{ id: "e" }] };
    const params = new URL(`http://test${path}`).searchParams;
    assert.equal(params.get("from"), "2026-11-01");
    assert.equal(params.get("to"), "2026-11-30");
    return params.has("cursor")
      ? { journals: [{ id: "a" }, { id: "b" }], nextCursor: null }
      : { journals: [{ id: "a" }], nextCursor: "after-a" };
  });
  const result = await loader("e", "2026-11", new AbortController().signal);
  assert.deepEqual(
    result.journals.map((j) => j.id),
    ["a", "b"],
  );
  assert.equal(calls.filter((p) => p.includes("/employees/e?")).length, 2);
});
test("partial-month failure, repeated cursors and invalid schedules are errors, not empty days", async () => {
  for (const mode of ["failed-page", "cursor-loop", "bad-schedule"]) {
    const loader = dataLoader(async (path) => {
      if (path === "/settings/work-schedule")
        return { schedule: mode === "bad-schedule" ? { days: [] } : schedule };
      if (path.startsWith("/whatsapp-reports/attendance/employees?"))
        return { employees: [{ id: "e" }] };
      if (mode === "failed-page" && path.includes("cursor="))
        throw new Error("page failed");
      return {
        journals: [{ id: "a" }],
        nextCursor: mode === "bad-schedule" ? null : "repeat",
      };
    });
    await assert.rejects(loader("e", "2026-11", new AbortController().signal));
  }
});
test("aborted loads cannot perform requests", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    dataLoader(async () => {
      calls++;
    })("e", "2026-11", controller.signal),
  );
  assert.equal(calls, 0);
});
