import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendanceDay, hasPriorDayShift, suggestAttendanceSite } from './attendance-mobile-rules.ts';
const now = Date.parse('2026-11-18T05:01:00Z');
const site = (id = 'nearby', lat = 3.4392, lng = -76.5362, radius = 200) => ({ id, worksite: { attendanceLatitude: lat, attendanceLongitude: lng, attendanceRadiusMeters: radius } });
const position = (extra = {}) => ({ latitude: 3.4392, longitude: -76.5362, accuracy: 12, timestamp: now, ...extra });
test('day follows Colombia, including the midnight boundary', () => {
  assert.equal(attendanceDay('2026-11-18T04:59:59Z'), '2026-11-17');
  assert.equal(attendanceDay('2026-11-18T05:00:00Z'), '2026-11-18');
  assert.equal(hasPriorDayShift('2026-11-18T04:59:59Z', new Date(now)), true);
  assert.equal(hasPriorDayShift('2026-11-18T05:00:00Z', new Date(now)), false);
});
test('precise fresh location suggests one containing site', () => {
  assert.equal(suggestAttendanceSite([site()], position(), now), 'nearby');
  assert.equal(suggestAttendanceSite([site()], position({accuracy:50}), now), 'nearby');
});
test('imprecise, invalid, stale and future GPS never suggest', () => {
  for (const extra of [{accuracy:51},{accuracy:0},{accuracy:NaN},{latitude:91},{longitude:181},{timestamp:now-60001},{timestamp:now+5001}]) assert.equal(suggestAttendanceSite([site()], position(extra), now), null);
});
test('missing site coordinates and a position outside the geofence never suggest', () => {
  assert.equal(suggestAttendanceSite([site('missing', null)], position(), now), null);
  assert.equal(suggestAttendanceSite([site()], position({latitude:3.45}), now), null);
  assert.equal(suggestAttendanceSite([site('tiny',3.4392,-76.5362,5)], position(), now), null);
});
test('overlapping worksites and boundary uncertainty require manual selection', () => {
  assert.equal(suggestAttendanceSite([site('a'),site('b')],position(),now),null);
  assert.equal(suggestAttendanceSite([site('a'),site('b',3.4411)],position({accuracy:30}),now),null);
  assert.equal(suggestAttendanceSite([site('a',3.4409)],position({accuracy:50}),now),null);
});
