import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attendanceLocalTime,
  attendanceCorrectionIso,
} from "./attendance-review-time.ts";

test("corrections use Colombia time independently of the computer timezone", () => {
  assert.equal(attendanceLocalTime("2026-11-18T02:35:24Z"), "2026-11-17T21:35");
  assert.equal(
    attendanceCorrectionIso("2026-11-18T07:30"),
    "2026-11-18T12:30:00.000Z",
  );
});
test("unchanged correction inputs preserve original seconds", () => {
  assert.equal(
    attendanceCorrectionIso("2026-11-18T07:30", "2026-11-18T12:30:45.123Z"),
    "2026-11-18T12:30:45.123Z",
  );
});
test("invalid and normalized calendar dates cannot become a different correction", () => {
  for (const value of [
    "",
    "2026-02-30T07:30",
    "2026-11-18T24:00",
    "2026-11-18T07:60",
    "invalid",
  ])
    assert.throws(() => attendanceCorrectionIso(value), /fecha y hora válidas/);
});
