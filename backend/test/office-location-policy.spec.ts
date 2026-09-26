import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GEOFENCE_RADIUS_METERS,
  MAX_GEOFENCE_RADIUS_METERS,
  MAX_GPS_ACCURACY_THRESHOLD_METERS,
} from '../src/modules/office-locations/domain/office-location-policy.js';

describe('office location policy', () => {
  it('uses the approved 100 metre default and maximum geofence radius', () => {
    expect(DEFAULT_GEOFENCE_RADIUS_METERS).toBe(100);
    expect(MAX_GEOFENCE_RADIUS_METERS).toBe(100);
  });

  it('keeps the GPS quality threshold separate from the geofence radius', () => {
    expect(MAX_GPS_ACCURACY_THRESHOLD_METERS).toBe(50);
  });
});
