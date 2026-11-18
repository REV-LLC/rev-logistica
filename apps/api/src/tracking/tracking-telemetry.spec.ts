import { routeHistory, telemetry } from './tracking-telemetry';

describe('Tracking telemetry evidence', () => {
  const now = Date.parse('2026-11-18T14:00:00Z');
  const point = { id: 1, deviceId: 2, latitude: 3.44, longitude: -76.53, valid: true, fixTime: new Date(now).toISOString(),
    serverTime: new Date(now).toISOString(), speed: 10, attributes: { batteryLevel: 69, charge: false, privateToken: 'never-return' } };
  it('keeps heartbeat reception distinct from an old GPS fix and whitelists attributes', () => {
    const result = telemetry({ ...point, fixTime: new Date(now - 2 * 86400_000).toISOString() }, now)!;
    expect(result).toMatchObject({ gpsState: 'stale', ageSeconds: 172800, batteryPercent: 69, speedKph: 19 });
    expect(JSON.stringify(result)).not.toContain('never-return');
  });
  it('does not invent a missing or invalid battery value', () => {
    expect(telemetry({ ...point, attributes: {} }, now)?.batteryPercent).toBeNull();
    expect(telemetry({ ...point, attributes: { batteryLevel: 101 } }, now)?.batteryPercent).toBeNull();
  });
  it.each([{ valid: false }, { latitude: 91 }, { longitude: NaN }, { fixTime: 'invalid' }, { fixTime: new Date(now + 61_000).toISOString() }])('rejects unusable coordinates or time %j', patch => {
    expect(telemetry({ ...point, ...patch }, now)).toBeNull();
  });
  it('sorts delayed reports, ignores duplicate fixes and other trucks, and breaks outages', () => {
    const p1 = { ...point, id: 1, fixTime: new Date(now - 1200_000).toISOString() };
    const p2 = { ...point, id: 2, latitude: 3.441, fixTime: new Date(now - 1140_000).toISOString() };
    const p3 = { ...point, id: 3, latitude: 3.442, fixTime: new Date(now - 60_000).toISOString() };
    const result = routeHistory([p3, p2, { ...p2, id: 4 }, p1, { ...p1, deviceId: 99 }, { ...p1, fixTime: new Date(now - 1300_000).toISOString() }], 2, now - 1200_000, now, now);
    expect(result.pointCount).toBe(3);
    expect(result.segments.map(s => s.map(p => p.id))).toEqual([[1, 2], [3]]);
    expect(result.gapCount).toBe(1);
    expect(result.distanceMeters).toBeGreaterThan(100);
    expect(result.distanceMeters).toBeLessThan(120);
  });
  it('does not draw a line through an implausible GPS jump', () => {
    const result = routeHistory([{ ...point, fixTime: new Date(now - 30_000).toISOString() }, { ...point, id: 2, latitude: 4.5 }], 2, now - 60_000, now, now);
    expect(result.segments).toHaveLength(2); expect(result.distanceMeters).toBe(0);
  });
});
