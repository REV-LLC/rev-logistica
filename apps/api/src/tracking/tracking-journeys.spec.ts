import { splitJourneys } from './tracking-journeys';
import type { NativePosition } from './tracking-telemetry';

describe('Recorded journeys separated by confirmed 15-minute parking', () => {
  const start = Date.parse('2026-11-19T10:00:00Z');
  const point = (minute: number, moving = false, patch: Partial<NativePosition> = {}): NativePosition => ({
    id: minute + 1, deviceId: 2, valid: true, latitude: moving ? 3.44 + minute / 1000 : 3.442,
    longitude: -76.53, accuracy: 10, speed: moving ? 10 : 0,
    fixTime: new Date(start + minute * 60_000).toISOString(), ...patch });
  const split = (points: NativePosition[], now = start + 25 * 60_000) => splitJourneys(points, 2, start, now, now);
  it('ends at the first stationary report after confirmation and restarts at the next movement', () => {
    const result = split([point(0, true), point(1, true), point(2), point(7), point(12), point(17), point(20, true), point(21, true)]);
    expect(result.journeys).toHaveLength(2);
    expect(result.journeys[0]).toMatchObject({ startedAt: point(0).fixTime, endedAt: point(2).fixTime, status: 'closed', endReason: 'pause' });
    expect(result.journeys[1]).toMatchObject({ startedAt: point(20).fixTime, endedAt: null, startReason: 'pause' });
    expect(result.stops[0]).toMatchObject({ startedAt: point(2).fixTime, resumedAt: point(20).fixTime, confirmedMinutes: 15 });
  });
  it('does not split a 14-minute stop or a traffic pause', () => {
    const result = split([point(0, true), point(2), point(7), point(12), point(16), point(17, true), point(22, true)]);
    expect(result.journeys).toHaveLength(1); expect(result.stops).toHaveLength(0);
    expect(result.journeys[0].endedAt).toBeNull();
  });
  it('does not create a journey for a truck parked the whole period', () => {
    expect(split([point(0), point(5), point(10), point(15), point(20)]).journeys).toHaveLength(0);
  });
  it('never converts missing reports or a heartbeat with an old fix into confirmed parking', () => {
    const result = split([point(0, true), point(2), point(7, false, { fixTime: point(2).fixTime }), point(25, true), point(26, true)], start + 30 * 60_000);
    expect(result.stops).toHaveLength(0);
    expect(result.journeys[0]).toMatchObject({ status: 'gap', endReason: 'gap' });
    expect(result.journeys[1].startReason).toBe('gap');
  });
  it('excludes poor accuracy from stop evidence and labels an old open journey as unknown', () => {
    const result = split([point(0, true), point(1, true), point(2, false, { accuracy: 300 }), point(7, false, { accuracy: 300 }), point(17, false, { accuracy: 300 })]);
    expect(result.stops).toHaveLength(0);
    expect(result.journeys[0]).toMatchObject({ endedAt: null, status: 'unknown' });
  });
  it('does not create a journey from a brief speed glitch within the same parking point', () => {
    const points = [point(0, true), point(2), point(7), point(12), point(17)].map(p => ({ ...p, latitude: 3.44 }));
    expect(split(points).journeys).toHaveLength(0);
  });
  it('handles delayed duplicate reports without changing journey IDs', () => {
    const points = [point(0, true), point(1, true), point(2), point(7), point(12), point(17)];
    const result = split(points);
    const shuffled = split([points[5], points[2], points[0], points[1], points[4], points[3], points[2]]);
    expect(shuffled).toEqual(result);
    expect(result.journeys[0].id).toBe('2:1');
  });
});
