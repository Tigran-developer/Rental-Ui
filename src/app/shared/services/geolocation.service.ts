import { Injectable } from '@angular/core';

import type { GeoPoint } from '../utils/haversine-distance.utils';

/**
 * A resolved coordinate PLUS the browser's own confidence in it. `GeoPoint`
 * itself (`shared/utils/haversine-distance.utils.ts`) stays a pure lat/lng
 * pair — it is shared with `haversineDistanceKm`, a plain math helper with no
 * business carrying GPS metadata. This service is the one place that needs
 * both, so it extends `GeoPoint` locally here instead of widening the math
 * type (and every one of its callers) for a concern only geolocation has.
 */
export interface GeolocatedPoint extends GeoPoint {
  /**
   * `GeolocationCoordinates.accuracy` verbatim (metres, 68% confidence radius
   * per the W3C spec) — `null` only if the browser reported something that
   * isn't a finite number (`undefined`/`NaN`; not disallowed by the spec, just
   * rare). Callers MUST consult this before drawing the resolved point as if
   * it were exact — a WiFi/IP-level fix can be off by kilometres while
   * carrying the exact same shape as a metre-accurate GPS fix if this field
   * is ignored. See `ListingLocationComponent`'s low-accuracy handling for
   * the concrete UI consequence.
   */
  accuracyMeters: number | null;
}

// The two `GeolocationPositionError.code` values a real desktop without a GPS
// radio realistically produces when asked for a high-accuracy fix: the
// high-accuracy attempt either can't produce a fix at all (POSITION_UNAVAILABLE)
// or just hangs until TIMEOUT. Compared as literal numbers, not
// `GeolocationPositionError.TIMEOUT`/`.POSITION_UNAVAILABLE` — those are
// instance properties on a REAL `GeolocationPositionError`, and this codebase's
// own tests (and any caller mocking the browser API) construct plain
// `{ code, message }` objects that don't carry them.
const POSITION_UNAVAILABLE_CODE = 2;
const TIMEOUT_CODE = 3;

// The fix, in one sentence: ask for the best the device can give
// (`enableHighAccuracy: true`) and refuse a stale cached fix
// (`maximumAge: 0`) — see the class doc comment for why the previous
// `{ enableHighAccuracy: false, maximumAge: 60_000 }` produced confidently
// wrong pins.
const PRIMARY_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 0,
};

// The ONE retry this service allows, and only for the two codes above — see
// `getCurrentPosition()`. Deliberately the OLD options: a cheap, WiFi/IP-level
// fix is still strictly better than no fix at all for a desktop that has no
// GPS radio to begin with, and this is the only place that fallback belongs
// now that the primary request always asks for high accuracy.
const FALLBACK_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 8000,
  maximumAge: 60_000,
};

/**
 * Thin, injectable wrapper around `navigator.geolocation.getCurrentPosition`.
 *
 * Exists purely as a DI seam: `navigator.geolocation` is a bare browser global
 * with a callback-style API, and nothing in this codebase can substitute a
 * fake implementation for a global at test time the way a provided service
 * can be overridden via `TestBed`. Consumers (`ListingLocationComponent`,
 * `LocationPickerComponent`, `RadiusOriginFilterComponent`; anything else that
 * needs "where is the visitor" later) inject this and get a
 * `Promise<GeolocatedPoint>` instead of touching `navigator` directly, so
 * their specs can supply a resolved/rejected fake without stubbing a global.
 *
 * Deliberately the ONLY file that reads `navigator.geolocation` — same
 * one-seam-per-browser-API convention `TILE_PROVIDER_CONFIG` and
 * `shared/ui/map/map.component.ts` already follow for tile config and
 * `matchMedia`/`ResizeObserver` respectively.
 *
 * **Accuracy, not just a coordinate.** The primary request asks for
 * `enableHighAccuracy: true` with `maximumAge: 0` — a PREVIOUS version of
 * this service asked for `enableHighAccuracy: false` with a 60s cache, which
 * explicitly tells the browser it is fine to answer from WiFi/IP triangulation
 * (an error of hundreds of metres to several kilometres in dense areas) and to
 * hand back a fix that's up to a minute stale. That produced a pin that LOOKED
 * exact — a single dot on the map, a distance line printed with full
 * confidence — while actually being a rough guess with no way for a caller to
 * tell the difference. `GeolocatedPoint.accuracyMeters` (`position.coords.
 * accuracy`, W3C-defined as metres) closes that gap: every caller gets the
 * browser's own confidence radius alongside the coordinate and is expected to
 * use it — never draw the resolved point as precise without first checking it.
 *
 * **One retry, and only for two error codes.** A high-accuracy request can
 * simply hang and expire (`TIMEOUT`, code 3) or fail outright
 * (`POSITION_UNAVAILABLE`, code 2) on a desktop with no GPS radio — that is
 * not a permission problem, just a device limitation, so this service falls
 * back ONCE to the old cheap/cached options rather than surfacing a timeout to
 * the caller when a WiFi/IP-level fix (with its accuracy honestly reported)
 * would have done. `PERMISSION_DENIED` (code 1) gets no retry — a different
 * accuracy mode changes nothing about a denial — and neither does the
 * "`navigator.geolocation` doesn't exist at all" branch below, which rejects
 * before any request is ever made.
 *
 * Never persists whatever coordinate (or accuracy) it resolves — that is the
 * CALLER's responsibility to uphold (Maps P2-3: a visitor's own location and
 * its precision must not be written to the URL, `localStorage`, or any
 * request body). This service itself has no storage of its own, so there is
 * nothing here that could leak.
 */
@Injectable({ providedIn: 'root' })
export class GeolocationService {
  /**
   * Resolves with the visitor's current coordinate plus its accuracy, or
   * rejects with whatever `GeolocationPositionError` (or a plain `Error` if
   * the API is unsupported) the browser reports — permission denied, position
   * unavailable, timeout, or "no `navigator.geolocation` at all" (very old
   * browsers, some embedded webviews). Callers treat every rejection the same
   * way (a soft "couldn't get your location" state, never a hard error) — see
   * `ListingLocationComponent.requestMyLocation()`'s doc comment for why a
   * single `denied`-shaped UI state covers all of these rather than
   * distinguishing permission-denied from timeout from unsupported. See the
   * class doc comment for the retry this method performs on TIMEOUT/
   * POSITION_UNAVAILABLE before rejecting.
   */
  getCurrentPosition(): Promise<GeolocatedPoint> {
    return new Promise<GeolocatedPoint>((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject(new Error('Geolocation is not supported in this environment.'));
        return;
      }
      const geolocation = navigator.geolocation;

      const succeed = (position: GeolocationPosition): void => {
        const rawAccuracy = position.coords.accuracy;
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters:
            typeof rawAccuracy === 'number' && Number.isFinite(rawAccuracy)
              ? rawAccuracy
              : null,
        });
      };

      geolocation.getCurrentPosition(
        succeed,
        (error) => {
          if (error.code === TIMEOUT_CODE || error.code === POSITION_UNAVAILABLE_CODE) {
            // The one cheap retry — see the class doc comment. Its own
            // failure is NOT retried again; it rejects straight through.
            geolocation.getCurrentPosition(succeed, reject, FALLBACK_OPTIONS);
            return;
          }
          reject(error);
        },
        PRIMARY_OPTIONS,
      );
    });
  }
}
