/**
 * Geo-fence arithmetic (CM-304, CM-308). A fence is a point and a radius in
 * metres (`modules/10` rebuild recommendation 13).
 */
export type GeoPoint = { latitude: number; longitude: number };

/** Mean Earth radius (IUGG), metres. */
export const EARTH_RADIUS_METRES = 6_371_008.8;

export function isLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two points, metres (haversine). */
export function haversineMetres(from: GeoPoint, to: GeoPoint): number {
  const dLat = radians(to.latitude - from.latitude);
  const dLng = radians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(a)));
}
