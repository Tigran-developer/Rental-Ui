/**
 * Viewport box sent to `GET /api/listings/map-pins` (`minLat`/`maxLat`/
 * `minLng`/`maxLng` query params — backend binds these as `decimal?` and only
 * applies the box when all four are present). Structurally identical to
 * `MapBounds` exported by `shared/ui/map/map.component.ts` — deliberately so:
 * the listings feature's store/API service must not import from
 * `shared/ui/map` (that file owns Leaflet, this one doesn't know it exists),
 * and TypeScript's structural typing lets the map component's emission be
 * passed straight through to `loadMapPins({ bounds })` without a mapping
 * step.
 *
 * The backend rejects `minLng > maxLng` (antimeridian viewports) with a 400
 * `ValidationProblemDetails` — callers must never construct one of those.
 */
export interface MapPinsBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}
