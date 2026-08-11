import { createActionGroup, emptyProps, props } from '@ngrx/store';

import type { MapLatLng, MapMarkerGroup } from '../../../shared/ui/map/map.component';
import type { HomeSectionResponse } from '../models/home-section.model';

export const HomeSectionsActions = createActionGroup({
  source: 'Home Sections',
  events: {
    Load: emptyProps(),
    'Load Success': props<{ sections: HomeSectionResponse[] }>(),
    'Load Failure': props<{ error: string }>(),
  },
});

/**
 * Hero map "nearby toys" preview (Home-page hero, Part 1 of the home-page
 * design alignment) — a Yerevan-fallback view by default, with an OPT-IN
 * geolocation upgrade. Kept as its own action group, not folded into
 * `HomeSectionsActions`: it is a fully independent async data source (an
 * optional browser-geolocation step, then an HTTP fetch) with its own
 * success/failure shape, following the same `createActionGroup` convention
 * `HomeSectionsActions` already does.
 *
 * **Geolocation is never requested automatically.** An earlier version of
 * this flow called `GeolocationService.getCurrentPosition()` from `init`
 * itself — i.e. the instant the landing page loaded, for every visitor. Two
 * problems with that (`/code-review` + `/security-review`, both flagged it):
 * a "Block" choice is stored per-ORIGIN by the browser, so the very first
 * Home visit could permanently disable the `/listings` radius filter's own
 * "use my location" button too (previously the only thing that ever
 * prompted); and precise visitor coordinates started reaching backend access
 * logs on nearly every page view, not just an intentional radius search.
 * Geolocation now only ever runs in response to `requestMyArea` — a real
 * click on the hero map's own opt-in control.
 *
 * Effect flow (`home.effects.ts`):
 * 1. `init` (dispatched by `HomePageComponent.ngOnInit`, alongside
 *    `HomeSectionsActions.load`) maps DIRECTLY to `useFallbackOrigin` — no
 *    geolocation call. The hero renders Yerevan-centred, pins from
 *    `YEREVAN_FALLBACK_BOUNDS`, a citywide count, no user dot, no radius
 *    circle. This is the default for every visitor, granted or not.
 * 2. `requestMyArea` (the hero map's own opt-in button, the ONLY trigger for
 *    `GeolocationService.getCurrentPosition()`) → granted: `originResolved`
 *    (origin = the visitor's own position, plus the browser's confidence
 *    radius) → a pins+count fetch scoped to `HOME_NEARBY_DEFAULT_RADIUS_KM`
 *    around it. Denied/failed: `useFallbackOrigin` — the SAME action `init`
 *    uses, since the resulting view is identical either way (Yerevan
 *    fallback); "denied" would be a lie for the `init` path, where nothing
 *    was ever asked, so this name covers both honestly.
 * 3. Either branch ends in `pinsLoadSuccess`/`pinsLoadFailure`.
 */
export const HomeNearbyActions = createActionGroup({
  source: 'Home Nearby',
  events: {
    Init: emptyProps(),
    'Request My Area': emptyProps(),
    'Origin Resolved': props<{ origin: MapLatLng; accuracyMeters: number | null }>(),
    'Use Fallback Origin': emptyProps(),
    'Pins Load Success': props<{ pins: MapMarkerGroup[]; nearbyCount: number | null }>(),
    'Pins Load Failure': props<{ error: string }>(),
  },
});
