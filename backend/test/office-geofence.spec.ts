import { describe, expect, it } from 'vitest';
import { OfficeGeofence } from '../src/modules/attendance/domain/office-geofence.js';

describe('OfficeGeofence', () => {
  const office = new OfficeGeofence(
    { latitude: 10.8024, longitude: 106.6621 },
    150,
  );

  it('accepts a point inside the configured radius', () => {
    expect(
      office.contains({ latitude: 10.80245, longitude: 106.66215 }),
    ).toBe(true);
  });

  it('rejects a point outside the configured radius', () => {
    expect(office.contains({ latitude: 10.805, longitude: 106.665 })).toBe(
      false,
    );
  });

  it('rejects invalid coordinates', () => {
    expect(() => office.contains({ latitude: 91, longitude: 0 })).toThrow(
      'GEO_POINT_LATITUDE_OUT_OF_RANGE',
    );
  });

  it('classifies points immediately on both sides of the 100 metre boundary', () => {
    const boundary = new OfficeGeofence({ latitude: 0, longitude: 0 }, 100);
    for (const distance of [99.999, 100.001]) {
      const point = { latitude: distance / 6371000 * 180 / Math.PI, longitude: 0 };
      expect(boundary.distanceFromCenter(point)).toBeCloseTo(distance, 6);
      expect(boundary.contains(point)).toBe(distance < 100);
    }
    const point = { latitude: 100 / 6371000 * 180 / Math.PI, longitude: 0 };
    const exact = new OfficeGeofence(boundary.center, boundary.distanceFromCenter(point));
    expect(exact.contains(point)).toBe(true);
  });

  it('keeps antipodal distance finite so a remote point cannot evade the outside-geofence flag', () => {
    const remote = new OfficeGeofence({ latitude: 2.500000000000001, longitude: 0 }, 100);
    const point = { latitude: -2.500000000000001, longitude: 180 };
    expect(Number.isFinite(remote.distanceFromCenter(point))).toBe(true);
    expect(remote.distanceFromCenter(point)).toBeCloseTo(Math.PI * 6371000, 1);
    expect(remote.contains(point)).toBe(false);
  });
});

