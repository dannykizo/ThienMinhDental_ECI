export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export function assertValidGeoPoint(point: GeoPoint): void {
  if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90) {
    throw new Error('GEO_POINT_LATITUDE_OUT_OF_RANGE');
  }

  if (!Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) {
    throw new Error('GEO_POINT_LONGITUDE_OUT_OF_RANGE');
  }
}

