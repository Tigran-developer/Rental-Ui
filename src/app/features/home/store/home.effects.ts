import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, forkJoin, from, map, of, switchMap } from 'rxjs';

import { toApiErrorMessage } from '../../../api/http-error-message.util';
import { GeolocationService } from '../../../shared/services/geolocation.service';
import type { MapMarkerGroup } from '../../../shared/ui/map/map.component';
import { YEREVAN_CENTER } from '../../listings/components/location-picker/location-picker.component';
import type { ListingMapPin } from '../../listings/models/listing-map-pin.model';
import { groupPinsByCoordinate } from '../../listings/models/listing-pin-group.util';
import type { MapPinsBounds } from '../../listings/models/map-pins-bounds.model';
import type {
  ListingsFilter,
  ListingsOriginCoords,
} from '../../listings/models/listings-filter.model';
import { ListingsApiService } from '../../listings/services/listings-api.service';
import { initialListingsState } from '../../listings/store/listings.state';
import { HomeApiService } from '../services/home-api.service';
import { HomeNearbyActions, HomeSectionsActions } from './home.actions';
import { HOME_NEARBY_DEFAULT_RADIUS_KM } from './home.state';

/**
 * A roughly citywide box around `YEREVAN_CENTER` (~10km lat, ~13km lng at
 * this latitude) — used ONLY as the hero map's pin fetch when showing the
 * Yerevan fallback (`HomeNearbyActions.useFallbackOrigin`). Not derived from
 * `radius-scale.util.ts`'s metre math (that converts a RADIUS to a slider
 * position; this is a fixed fallback viewport, not a radius), and not a
 * precision claim — just "enough of the city to show some pins" for a
 * decorative preview map, matching the app's Yerevan-only MVP scope.
 */
const YEREVAN_FALLBACK_BOUNDS: MapPinsBounds = {
  minLat: YEREVAN_CENTER.lat - 0.045,
  maxLat: YEREVAN_CENTER.lat + 0.045,
  minLng: YEREVAN_CENTER.lng - 0.06,
  maxLng: YEREVAN_CENTER.lng + 0.06,
};

/**
 * `ListingMapPin[]` -> `MapMarkerGroup[]`, reusing `ListingsMapComponent`'s
 * OWN coordinate-grouping convention (`groupPinsByCoordinate` — pins sharing
 * the exact fuzzed/geohash-cell-centroid coordinate become one group, `key`
 * is that coordinate pair formatted to 6 decimals) rather than inventing a
 * second one for the hero map.
 */
function mapPinsToMarkerGroups(pins: ListingMapPin[]): MapMarkerGroup[] {
  return groupPinsByCoordinate(pins).map((group) => ({
    key: group.key,
    position: { lat: group.latitude, lng: group.longitude },
    count: group.pins.length,
  }));
}

/**
 * Rounds a coordinate to 3 decimal places (~100m at this latitude) — the
 * precision this app already treats as publishable (backend map pins are
 * geohash-7 centroids, a comparable order of magnitude), and plenty for a
 * decorative hero badge/pin cluster. Applied ONLY to what leaves the client
 * as `originLat`/`originLng` query params (`/security-review`, Medium: query
 * params land in server access logs, proxy logs, and browser history, so
 * full-precision coordinates have no business riding along on a request that
 * only needs ~city-block precision to answer "how many toys nearby"). Must
 * NEVER be applied to the coordinate used for local display — see
 * `loadNearbyPinsForOrigin$` below for the precise-vs-rounded split this
 * exists to keep honest.
 */
function roundCoordForApi(value: number): number {
  return Math.round(value * 1000) / 1000;
}

@Injectable()
export class HomeEffects {
  private readonly actions$ = inject(Actions);
  private readonly homeApi = inject(HomeApiService);
  private readonly listingsApi = inject(ListingsApiService);
  private readonly geolocation = inject(GeolocationService);

  readonly loadSections$ = createEffect(() =>
    this.actions$.pipe(
      ofType(HomeSectionsActions.load),
      switchMap(() =>
        this.homeApi.getHomeSections(4).pipe(
          map((sections) => HomeSectionsActions.loadSuccess({ sections })),
          catchError((error: unknown) =>
            of(
              HomeSectionsActions.loadFailure({
                error: error instanceof Error ? error.message : 'Failed to load toy sections',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  /**
   * `init` (Home page mount) never calls geolocation — see
   * `HomeNearbyActions`'s own doc comment for why. A pure, synchronous
   * re-map to `useFallbackOrigin`, which `loadNearbyPinsForYerevan$` below
   * turns into the actual pins fetch — kept as its own tiny effect (rather
   * than inlining the fetch here) so `useFallbackOrigin` has exactly ONE
   * effect reacting to it regardless of which of its two triggers
   * (`init` or a denied/failed `requestMyArea`) fired it.
   */
  readonly initToFallback$ = createEffect(() =>
    this.actions$.pipe(
      ofType(HomeNearbyActions.init),
      map(() => HomeNearbyActions.useFallbackOrigin()),
    ),
  );

  /**
   * `requestMyArea` — the hero map's own opt-in control, and the ONLY thing
   * in this codebase that triggers `GeolocationService.getCurrentPosition()`
   * for the Home page. `getCurrentPosition()` already resolves/rejects with
   * every case (denied, unsupported, position-unavailable, timeout) folded
   * into one promise settlement, so a rejection here always degrades to
   * `useFallbackOrigin` — never a hard error surfaced to the visitor (a
   * denial must never read as "something broke").
   */
  readonly resolveNearbyOrigin$ = createEffect(() =>
    this.actions$.pipe(
      ofType(HomeNearbyActions.requestMyArea),
      switchMap(() =>
        from(this.geolocation.getCurrentPosition()).pipe(
          map((point) =>
            HomeNearbyActions.originResolved({
              origin: { lat: point.lat, lng: point.lng },
              accuracyMeters: point.accuracyMeters,
            }),
          ),
          catchError(() => of(HomeNearbyActions.useFallbackOrigin())),
        ),
      ),
    ),
  );

  /** Granted branch: pins AND the total count within
   *  `HOME_NEARBY_DEFAULT_RADIUS_KM` of the visitor's own position —
   *  `pageSize: 1` on the count request since only `totalCount` is read
   *  (there is no dedicated count-near-a-point endpoint; see the class doc
   *  comment in the feature spec this implements). Deliberately builds its
   *  OWN filter from `initialListingsState.filters` rather than reading
   *  `ListingsState.filters`/`originCoords` — the hero preview must never be
   *  affected by whatever the visitor last searched/set on `/listings`, and
   *  must never write into that state either (`ListingsActions.loadMapPins`
   *  is never dispatched here).
   *
   *  `originCoords` (sent as the `originLat`/`originLng` query params) is
   *  ROUNDED via `roundCoordForApi` — `origin` itself (full precision, from
   *  the `originResolved` action payload) is what already reached the
   *  store and drives `userPin`, so the blue dot still sits exactly where
   *  the visitor is; only the OUTGOING request is coarsened. Keep this
   *  split: collapsing it into one rounded value would misplace the user
   *  dot by up to ~100m for no reason, and un-rounding the request would
   *  put full-precision coordinates back in server/proxy access logs and
   *  browser history for a badge that only needs city-block precision. */
  readonly loadNearbyPinsForOrigin$ = createEffect(() =>
    this.actions$.pipe(
      ofType(HomeNearbyActions.originResolved),
      switchMap(({ origin }) => {
        const filter: ListingsFilter = {
          ...initialListingsState.filters,
          radiusKm: HOME_NEARBY_DEFAULT_RADIUS_KM,
        };
        const originCoords: ListingsOriginCoords = {
          lat: roundCoordForApi(origin.lat),
          lng: roundCoordForApi(origin.lng),
        };
        return forkJoin({
          pins: this.listingsApi.getMapPins(filter, null, originCoords),
          count: this.listingsApi.getListings(filter, 1, 1, originCoords),
        }).pipe(
          map(({ pins, count }) =>
            HomeNearbyActions.pinsLoadSuccess({
              pins: mapPinsToMarkerGroups(pins.items),
              nearbyCount: count.totalCount,
            }),
          ),
          catchError((error: unknown) =>
            of(HomeNearbyActions.pinsLoadFailure({ error: toApiErrorMessage(error) })),
          ),
        );
      }),
    ),
  );

  /** Fallback branch (default on `init`, and the outcome of a denied/failed
   *  `requestMyArea`): pins around Yerevan only (`YEREVAN_FALLBACK_BOUNDS`),
   *  no origin — but the pill still shows whenever the pins response alone
   *  can honestly answer "how many": `getMapPins` reports `isTruncated`, so
   *  `!isTruncated` means the backend returned EVERY pin inside the fallback
   *  box, and `items.length` IS the true count, not an estimate — no second
   *  request needed. `isTruncated === true` means the backend capped the
   *  response, so `items.length` would only be a FLOOR, not a count;
   *  rendering a truncated floor as a definitive figure is exactly the
   *  "guess rendered as a fact" failure recorded as M-027 in
   *  knowledge/mistakes.md — so this leaves `nearbyCount: null` (pill stays
   *  hidden) rather than showing a misleading number or a vague "50+".
   *
   *  Note the count means something different per branch: "within
   *  `HOME_NEARBY_DEFAULT_RADIUS_KM` of you" when granted
   *  (`loadNearbyPinsForOrigin$` above) vs. "in the visible Yerevan fallback
   *  area" here — both are honest, just answering slightly different
   *  questions, which is why `HomeHeroMapComponent` renders them through TWO
   *  separate i18n keys (`nearbyCount` / `cityCount`) rather than one shared
   *  string that would read as a proximity claim the fallback number cannot
   *  support. */
  readonly loadNearbyPinsForYerevan$ = createEffect(() =>
    this.actions$.pipe(
      ofType(HomeNearbyActions.useFallbackOrigin),
      switchMap(() =>
        this.listingsApi
          .getMapPins(initialListingsState.filters, YEREVAN_FALLBACK_BOUNDS, null)
          .pipe(
            map((result) =>
              HomeNearbyActions.pinsLoadSuccess({
                pins: mapPinsToMarkerGroups(result.items),
                nearbyCount: result.isTruncated ? null : result.items.length,
              }),
            ),
            catchError((error: unknown) =>
              of(HomeNearbyActions.pinsLoadFailure({ error: toApiErrorMessage(error) })),
            ),
          ),
      ),
    ),
  );
}
