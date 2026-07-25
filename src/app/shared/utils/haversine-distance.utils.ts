/** A latitude/longitude pair — mirrors `MapLatLng` (`shared/ui/map/map.component.ts`)
 *  without importing that file, so this pure-math helper has zero dependency
 *  on Leaflet/the map component. */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Mean Earth radius (km), WGS-84 — the exact constant `ListingsQueryService`
 * (rental-api) uses for both its radius-filter refinement and the
 * `ListingPreviewResponse.DistanceKm` projection. Keep this in sync with
 * `EarthRadiusKm` there if it ever changes.
 */
export const EARTH_RADIUS_KM = 6371.0088;

/**
 * Great-circle distance (km) between two lat/lng points, Haversine formula —
 * written to match `ListingsQueryService`'s inline LINQ expression
 * (rental-api) term-for-term, so a renter's client-side "≈X km from you"
 * line can never disagree with a value the backend would compute for the
 * same two points (the catalogue's `DistanceKm` badge, the radius filter).
 * There is no live "distance to this listing" endpoint for the listing-detail
 * page — the renter's own location is never sent to the server (Maps P2-3:
 * it must not be persisted anywhere, not even in a request log), so this
 * runs entirely client-side against the listing's already-fuzzed public
 * coordinate.
 */
export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const sinDLat = Math.sin(toRad(b.lat - a.lat) / 2);
  const sinDLng = Math.sin(toRad(b.lng - a.lng) / 2);
  const h =
    sinDLat * sinDLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}
