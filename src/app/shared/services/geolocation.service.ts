import { Injectable } from '@angular/core';

import type { GeoPoint } from '../utils/haversine-distance.utils';

/**
 * Thin, injectable wrapper around `navigator.geolocation.getCurrentPosition`.
 *
 * Exists purely as a DI seam: `navigator.geolocation` is a bare browser global
 * with a callback-style API, and nothing in this codebase can substitute a
 * fake implementation for a global at test time the way a provided service
 * can be overridden via `TestBed`. Consumers (`ListingLocationComponent`,
 * today; anything else that needs "where is the visitor" later) inject this
 * and get a `Promise<GeoPoint>` instead of touching `navigator` directly, so
 * their specs can supply a resolved/rejected fake without stubbing a global.
 *
 * Deliberately the ONLY file that reads `navigator.geolocation` — same
 * one-seam-per-browser-API convention `TILE_PROVIDER_CONFIG` and
 * `shared/ui/map/map.component.ts` already follow for tile config and
 * `matchMedia`/`ResizeObserver` respectively.
 *
 * Never persists whatever coordinate it resolves — that is the CALLER's
 * responsibility to uphold (Maps P2-3: a visitor's own location must not be
 * written to the URL, `localStorage`, or any request body). This service
 * itself has no storage of its own, so there is nothing here that could leak.
 */
@Injectable({ providedIn: 'root' })
export class GeolocationService {
  /**
   * Resolves with the visitor's current coordinate, or rejects with whatever
   * `GeolocationPositionError` (or a plain `Error` if the API is unsupported)
   * the browser reports — permission denied, position unavailable, timeout,
   * or "no `navigator.geolocation` at all" (very old browsers, some embedded
   * webviews). Callers treat every rejection the same way (a soft "couldn't
   * get your location" state, never a hard error) — see
   * `ListingLocationComponent.requestMyLocation()`'s doc comment for why a
   * single `denied`-shaped UI state covers all of these rather than
   * distinguishing permission-denied from timeout from unsupported.
   */
  getCurrentPosition(): Promise<GeoPoint> {
    return new Promise<GeoPoint>((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject(new Error('Geolocation is not supported in this environment.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({ lat: position.coords.latitude, lng: position.coords.longitude });
        },
        (error) => {
          reject(error);
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
      );
    });
  }
}
