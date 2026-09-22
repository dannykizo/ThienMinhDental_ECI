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
});

