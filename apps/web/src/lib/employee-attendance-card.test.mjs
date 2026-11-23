import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const {
  loadTransportModule,
} = require("../components/transport/test-support.cjs");

test("embedded attendance uses the loaded identity instead of querying the whole employee directory", async () => {
  const paths = [];
  const schedule = {
    days: Array.from({ length: 7 }, (_, index) => ({
      dayOfWeek: index + 1,
      periods: [],
    })),
  };
  const { loadAttendanceCalendar } = loadTransportModule(
    new URL("./attendance-calendar-data.ts", import.meta.url).pathname,
    {
      "./api": {
        api: async (path) => {
          paths.push(path);
          if (path === "/settings/work-schedule") return { schedule };
          if (path.includes("/attendance/employees/e?"))
            return { journals: [], nextCursor: null };
          throw new Error(`Unexpected call: ${path}`);
        },
      },
    },
  );
  const employee = { id: "e", name: "Andrés", lastName: "Torres" };
  const data = await loadAttendanceCalendar(
    "e",
    "2026-11",
    new AbortController().signal,
    employee,
  );
  assert.deepEqual(data.employee, employee);
  assert.equal(paths.length, 2);
  assert.equal(
    paths.some((path) =>
      path.startsWith("/whatsapp-reports/attendance/employees?"),
    ),
    false,
  );
});

test("calendar is a reusable profile card, not an attendance page replacement or self-service feature", () => {
  const profile = readFileSync(
    new URL("../components/EmployeeProfile.tsx", import.meta.url),
    "utf8",
  );
  const page = readFileSync(
    new URL(
      "../app/employees/attendance/[employeeId]/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const card = readFileSync(
    new URL(
      "../components/employees/EmployeeAttendanceCard.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const css = readFileSync(
    new URL(
      "../components/employees/EmployeeAttendanceCard.module.css",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(profile, /canViewAttendance \? <aside/);
  assert.match(profile, /!selfService && \['ADMIN', 'OFFICE'\]\.includes/);
  assert.match(page, /<AttendanceEmployeeCards/);
  assert.doesNotMatch(page, /AttendanceMonthCalendar|EmployeeAttendanceCard/);
  assert.doesNotMatch(
    card,
    /Volver a empleados|EmployeeCardIdentity|value="journals"/,
  );
  assert.match(css, /max-width: 340px/);
  assert.match(css, /aspect-ratio: 1/);
  assert.match(css, /border-radius: 6px/);
  assert.doesNotMatch(
    card,
    /styles\.dayNumber|const weekdays|length: offset|length: trailing/,
  );
  assert.match(card, /tooltipDateFormat/);
  assert.doesNotMatch(card, /styles\.legend|TextInput|IconRefresh/);
  assert.doesNotMatch(card, /<Title|styles\.title/);
  assert.doesNotMatch(
    card,
    /styles\.selected|styles\.context|IconEye|Tarde desde 5 min/,
  );
  assert.match(card, /onClick=\{\(\) => reviewDay\(day\)\}/);
  assert.match(card, /month: "short"/);
  assert.match(card, /styles\.monthLabel/);
  assert.match(card, /styles\.header/);
  assert.match(css, /grid-template-columns: 30px minmax\(0, 1fr\) 30px/);
  assert.match(css, /background: var\(--day-accent\)/);
  const profileCss = readFileSync(
    new URL(
      "../app/employees/[employeeId]/profile.module.css",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(profileCss, /grid-template-columns: 320px minmax\(0, 1fr\)/);
});
