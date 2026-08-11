import type { MapLatLng, MapMarkerGroup } from '../../../shared/ui/map/map.component';
import type { HomeSectionResponse } from '../models/home-section.model';

/**
 * Default radius (km) for the hero map's ambient "nearby toys" preview — the
 * Home-page hero map design's own fixed default (1.2 km), unlike the
 * `/listings` radius filter's user-adjustable slider
 * (`radius-scale.util.ts`). There is no UI control to change this on the
 * hero map, so it is a single constant, not a slider-scale value.
 */
export const HOME_NEARBY_DEFAULT_RADIUS_KM = 1.2;

/**
 * Hero map "nearby toys" preview slice (Home-page hero, Part 1 of the
 * home-page design alignment) — origin (the Yerevan fallback by default, or
 * the visitor's own position once opted in) plus the pins/count fetched
 * around it. See `HomeNearbyActions`' own doc comment (`home.actions.ts`)
 * for the full effect flow, and in particular why geolocation is never
 * requested automatically.
 *
 * Deliberately its OWN slice, not folded into `ListingsState`: this never
 * dispatches the listings feature's `loadMapPins` (that writes
 * `ListingsState.mapPins`, which the `/listings` map view owns) and never
 * touches `ListingsState.originCoords` either — the hero preview's origin is
 * session-local to the Home page, computed independently the moment Home
 * mounts (or the visitor opts in), not shared with whatever the visitor
 * later does on `/listings`.
 */
export interface HomeNearbyState {
  /** The point the hero map is centred/pinned on — the visitor's own
   *  position once opted in AND geolocation resolves, or `YEREVAN_CENTER`
   *  otherwise (the default, unconditional on page load — see
   *  `HomeNearbyActions`' doc comment). `null` only in the brief window
   *  before EITHER `useFallbackOrigin` or `originResolved` has landed (right
   *  after `HomeNearbyActions.init`) — the map still renders then too, just
   *  without a `userPin`/circle (see `HomePageComponent`'s own
   *  `heroMapCenter` derivation, which falls back to `YEREVAN_CENTER` for
   *  that window). */
  readonly origin: MapLatLng | null;
  /** `true` whenever the hero is showing the Yerevan CITYWIDE fallback
   *  rather than the visitor's own position — the default on every page
   *  load (nothing was ever asked), and also the outcome of an opt-in
   *  request that was denied/failed. Deliberately NOT named `originDenied`:
   *  that would misdescribe the (far more common) "never asked at all"
   *  case as a denial. Drives suppressing `userPin`/the radius circle —
   *  there is no real "your location" point to show — and which of the
   *  pill's two i18n keys renders (`home.heroMap.nearbyCount` vs.
   *  `home.heroMap.cityCount` — see `HomeHeroMapComponent`). */
  readonly isFallback: boolean;
  /** `true` while an opt-in `requestMyArea` geolocation call is in flight —
   *  drives the hero map's own opt-in button into a busy/disabled state so
   *  a visitor can't double-dispatch the browser permission prompt.
   *  Deliberately separate from `loading` (below): that tracks the PINS
   *  HTTP fetch, which also runs on the unconditional `init` path where
   *  there is no button interaction to reflect at all. */
  readonly locating: boolean;
  /** The browser's own confidence radius (metres) for `origin` — set only
   *  alongside a genuinely resolved geolocation fix, `null` otherwise
   *  (including the fallback case). Not part of the map spec's own literal
   *  state-shape listing, but required to satisfy "show userPin +
   *  userAccuracyMeters" once granted — see the delivery report for this
   *  flagged addition. */
  readonly accuracyMeters: number | null;
  /** Search radius in km — always `HOME_NEARBY_DEFAULT_RADIUS_KM` today (no
   *  UI control adjusts it); kept as its own field, not a hardcoded literal
   *  at every read site, the same way `ListingsFilter.radiusKm` is. */
  readonly radiusKm: number;
  /** Nearby listings, already grouped into `MapMarkerGroup`s (Maps P2-2's own
   *  coordinate-grouping convention — see `mapPinsToMarkerGroups` in
   *  `home.effects.ts`), ready to hand straight to `app-map`'s `[markers]`. */
  readonly pins: MapMarkerGroup[];
  /** Count for whichever branch last resolved — "within `radiusKm` of you"
   *  when `!isFallback`, "in the visible Yerevan fallback area" when
   *  `isFallback` (see `isFallback`'s own doc comment for why the two
   *  numbers must never share one i18n string). `null` while unknown
   *  (before the first fetch resolves, or whenever the backend's result was
   *  truncated — M-027: a truncated `items.length` is a floor, not a count,
   *  so `home.effects.ts` deliberately leaves this `null` rather than show
   *  it as one). Drives the hero map's pill: hidden while `null`, never
   *  shown as a false "0" on first paint. */
  readonly nearbyCount: number | null;
  readonly loading: boolean;
  readonly error: string | null;
}

export const initialHomeNearbyState: HomeNearbyState = {
  origin: null,
  isFallback: false,
  locating: false,
  accuracyMeters: null,
  radiusKm: HOME_NEARBY_DEFAULT_RADIUS_KM,
  pins: [],
  nearbyCount: null,
  loading: false,
  error: null,
};

export interface HomeState {
  readonly sections: HomeSectionResponse[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly nearby: HomeNearbyState;
}

export const initialHomeState: HomeState = {
  sections: [],
  loading: false,
  error: null,
  nearby: initialHomeNearbyState,
};
