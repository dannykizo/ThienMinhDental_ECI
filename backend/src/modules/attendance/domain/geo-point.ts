export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export function assertValidGeoPoint(point: GeoPoint): void {
  if (point.latitude < -90 || point.latitude > 90) {
    throw new Error('GEO_POINT_LATITUDE_OUT_OF_RANGE');
  }

  if (point.longitude < -180 || point.longitude > 180) {
    throw new Error('GEO_POINT_LONGITUDE_OUT_OF_RANGE');
  }
}

