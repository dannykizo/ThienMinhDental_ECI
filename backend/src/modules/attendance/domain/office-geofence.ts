import { assertValidGeoPoint, type GeoPoint } from './geo-point.js';

const EARTH_RADIUS_METERS = 6_371_000;

export class OfficeGeofence {
  constructor(
    readonly center: GeoPoint,
    readonly radiusMeters: number,
  ) {
    assertValidGeoPoint(center);

    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
      throw new Error('GEOFENCE_RADIUS_MUST_BE_POSITIVE');
    }
  }

  contains(point: GeoPoint): boolean {
    assertValidGeoPoint(point);
    return this.distanceFromCenter(point) <= this.radiusMeters;
  }

  private distanceFromCenter(point: GeoPoint): number {
    const latitudeDelta = toRadians(point.latitude - this.center.latitude);
    const longitudeDelta = toRadians(point.longitude - this.center.longitude);
    const centerLatitude = toRadians(this.center.latitude);
    const pointLatitude = toRadians(point.latitude);

    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(centerLatitude) *
        Math.cos(pointLatitude) *
        Math.sin(longitudeDelta / 2) ** 2;

    const angularDistance =
      2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

    return EARTH_RADIUS_METERS * angularDistance;
  }
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

