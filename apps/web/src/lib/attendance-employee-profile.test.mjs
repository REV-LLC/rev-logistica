import assert from "node:assert/strict";
import { test } from "node:test";
import { attendanceEmployeeProfile } from "./attendance-employee-profile.ts";
test("attendance operator cards include both operator jobs, with or without a software account", () => {
  for (const role of ["HEAVY_MACHINERY_OPERATOR", "MACHINIST"])
    for (const accountRole of [null, "OPERATOR"])
      assert.equal(
        attendanceEmployeeProfile({ role, accountRole }),
        "operators",
      );
});
test("office, administrators and drivers never enter the operator filter, even with an operator job", () => {
  for (const role of ["HEAVY_MACHINERY_OPERATOR", "MACHINIST"])
    for (const accountRole of ["ADMIN", "OFFICE", "DRIVER"])
      assert.notEqual(
        attendanceEmployeeProfile({ role, accountRole }),
        "operators",
      );
  for (const role of ["OFFICE", "MANAGER", "OPERATIONS_MANAGER", "DRIVER"])
    assert.notEqual(
      attendanceEmployeeProfile({ role, accountRole: null }),
      "operators",
    );
});
test("other jobs remain available separately", () => {
  for (const role of ["MECHANIC", "WAREHOUSE_KEEPER", "OTHER"])
    assert.equal(
      attendanceEmployeeProfile({ role, accountRole: null }),
      "others",
    );
});
