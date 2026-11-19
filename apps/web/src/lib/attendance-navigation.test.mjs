import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attendanceEmployeeHref,
  attendanceOverviewHref,
} from "./attendance-navigation.ts";

test("employee attendance has a dedicated route with the selected period", () => {
  assert.equal(
    attendanceEmployeeHref("employee", {
      from: "2026-11-01",
      to: "2026-11-30",
    }),
    "/employees/attendance/employee?from=2026-11-01&to=2026-11-30",
  );
  assert.equal(
    attendanceEmployeeHref("employee", { date: "2026-11-19" }),
    "/employees/attendance/employee?date=2026-11-19",
  );
  assert.equal(
    attendanceOverviewHref({ from: "2026-11-01", to: "2026-11-30" }),
    "/employees/attendance?from=2026-11-01&to=2026-11-30",
  );
});
test("route identifiers and query values are encoded and empty periods add no query", () => {
  assert.equal(
    attendanceEmployeeHref("employee"),
    "/employees/attendance/employee",
  );
  assert.equal(
    attendanceEmployeeHref("a/b?c", { date: "x&kind=bad" }),
    "/employees/attendance/a%2Fb%3Fc?date=x%26kind%3Dbad",
  );
});
