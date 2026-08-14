import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { actionsHarness, collect } from '../../../../testing/ngrx.helpers';
import { makeListingMapPin } from '../../../../testing/fixtures';
import { GeolocationService } from '../../../shared/services/geolocation.service';
import { ListingsApiService } from '../../listings/services/listings-api.service';
import { initialListingsState } from '../../listings/store/listings.state';
import { HomeApiService } from '../services/home-api.service';
import { HomeNearbyActions } from './home.actions';
import { HomeEffects } from './home.effects';
import { HOME_NEARBY_DEFAULT_RADIUS_KM } from './home.state';

function setup(
  overrides: {
    listingsApi?: Partial<ListingsApiService>;
    geolocation?: Partial<GeolocationService>;
  } = {},
) {
  const harness = actionsHarness();
  TestBed.configureTestingModule({
    providers: [
      HomeEffects,
      harness.provider,
      { provide: HomeApiService, useValue: {} },
      { provide: ListingsApiService, useValue: overrides.listingsApi ?? {} },
      {
        provide: GeolocationService,
        useValue: overrides.geolocation ?? { getCurrentPosition: vi.fn() },
      },
    ],
  });
  return { harness, effects: TestBed.inject(HomeEffects) };
}

describe('HomeEffects — hero map "nearby toys" preview', () => {
  describe('initToFallback$', () => {
    it('maps init straight to useFallbackOrigin WITHOUT ever calling GeolocationService', async () => {
      const getCurrentPosition = vi.fn();
      const { harness, effects } = setup({ geolocation: { getCurrentPosition } });

      const collected = collect(effects.initToFallback$);
      harness.send(HomeNearbyActions.init());
      harness.complete();

      expect(await collected).toEqual([HomeNearbyActions.useFallbackOrigin()]);
      // The whole point of this effect (`/code-review` + `/security-review`,
      // both flagged the old automatic-prompt-on-load behaviour): a page
      // load must NEVER touch the browser geolocation API on its own.
      expect(getCurrentPosition).not.toHaveBeenCalled();
    });
  });

  describe('resolveNearbyOrigin$ (opt-in — requestMyArea only)', () => {
    it('dispatches originResolved with the resolved point when geolocation is granted', async () => {
      const getCurrentPosition = vi
        .fn()
        .mockResolvedValue({ lat: 40.2, lng: 44.6, accuracyMeters: 25 });
      const { harness, effects } = setup({ geolocation: { getCurrentPosition } });

      const collected = collect(effects.resolveNearbyOrigin$);
      harness.send(HomeNearbyActions.requestMyArea());
      harness.complete();

      expect(await collected).toEqual([
        HomeNearbyActions.originResolved({
          origin: { lat: 40.2, lng: 44.6 },
          accuracyMeters: 25,
        }),
      ]);
    });

    it('dispatches useFallbackOrigin — never a hard error — when geolocation rejects (denied/timeout/unsupported)', async () => {
      const getCurrentPosition = vi.fn().mockRejectedValue(new Error('denied'));
      const { harness, effects } = setup({ geolocation: { getCurrentPosition } });

      const collected = collect(effects.resolveNearbyOrigin$);
      harness.send(HomeNearbyActions.requestMyArea());
      harness.complete();

      expect(await collected).toEqual([HomeNearbyActions.useFallbackOrigin()]);
    });

    it('never reacts to init directly — only requestMyArea triggers geolocation', async () => {
      const getCurrentPosition = vi.fn();
      const { harness, effects } = setup({ geolocation: { getCurrentPosition } });

      const collected = collect(effects.resolveNearbyOrigin$);
      harness.send(HomeNearbyActions.init());
      harness.complete();

      expect(await collected).toEqual([]);
      expect(getCurrentPosition).not.toHaveBeenCalled();
    });
  });

  describe('loadNearbyPinsForOrigin$ (granted branch)', () => {
    it('fetches pins AND the count within HOME_NEARBY_DEFAULT_RADIUS_KM of the resolved origin', async () => {
      const pin = makeListingMapPin({ latitude: 40.2, longitude: 44.6 });
      const getMapPins = vi.fn().mockReturnValue(of({ items: [pin], isTruncated: false }));
      const getListings = vi
        .fn()
        .mockReturnValue(of({ items: [], totalCount: 7, page: 1, pageSize: 1, hasMore: true }));
      const { harness, effects } = setup({ listingsApi: { getMapPins, getListings } });

      const collected = collect(effects.loadNearbyPinsForOrigin$);
      harness.send(
        HomeNearbyActions.originResolved({ origin: { lat: 40.2, lng: 44.6 }, accuracyMeters: 10 }),
      );
      harness.complete();

      expect(await collected).toEqual([
        HomeNearbyActions.pinsLoadSuccess({
          pins: [
            {
              key: '40.200000,44.600000',
              position: { lat: 40.2, lng: 44.6 },
              count: 1,
            },
          ],
          nearbyCount: 7,
        }),
      ]);
      expect(getMapPins).toHaveBeenCalledWith(
        expect.objectContaining({ radiusKm: HOME_NEARBY_DEFAULT_RADIUS_KM }),
        null,
        { lat: 40.2, lng: 44.6 },
      );
      // pageSize: 1 — only `totalCount` is read off this response; there is
      // no dedicated count-near-a-point endpoint (see the effect's own doc
      // comment in home.effects.ts).
      expect(getListings).toHaveBeenCalledWith(
        expect.objectContaining({ radiusKm: HOME_NEARBY_DEFAULT_RADIUS_KM }),
        1,
        1,
        { lat: 40.2, lng: 44.6 },
      );
    });

    it('rounds the coordinates sent to the API to 3 decimal places (~100m) — /security-review, Medium', async () => {
      const getMapPins = vi.fn().mockReturnValue(of({ items: [], isTruncated: false }));
      const getListings = vi
        .fn()
        .mockReturnValue(of({ items: [], totalCount: 0, page: 1, pageSize: 1, hasMore: false }));
      const { harness, effects } = setup({ listingsApi: { getMapPins, getListings } });

      const collected = collect(effects.loadNearbyPinsForOrigin$);
      // Full-precision coordinates, as a real GPS fix would report them.
      harness.send(
        HomeNearbyActions.originResolved({
          origin: { lat: 40.177612345, lng: 44.512698765 },
          accuracyMeters: 10,
        }),
      );
      harness.complete();
      await collected;

      const roundedOrigin = { lat: 40.178, lng: 44.513 };
      expect(getMapPins).toHaveBeenCalledWith(expect.anything(), null, roundedOrigin);
      expect(getListings).toHaveBeenCalledWith(expect.anything(), 1, 1, roundedOrigin);
    });

    it("never dispatches the listings feature's own loadMapPins — Home must not stomp ListingsState.mapPins", async () => {
      const getMapPins = vi.fn().mockReturnValue(of({ items: [], isTruncated: false }));
      const getListings = vi
        .fn()
        .mockReturnValue(of({ items: [], totalCount: 0, page: 1, pageSize: 1, hasMore: false }));
      const { harness, effects } = setup({ listingsApi: { getMapPins, getListings } });

      const collected = collect(effects.loadNearbyPinsForOrigin$);
      harness.send(
        HomeNearbyActions.originResolved({
          origin: { lat: 40.2, lng: 44.6 },
          accuracyMeters: null,
        }),
      );
      harness.complete();

      const emitted = await collected;
      expect(emitted.every((action) => action.type.startsWith('[Home Nearby]'))).toBe(true);
    });

    it('emits pinsLoadFailure when the fetch errors', async () => {
      const getMapPins = vi.fn().mockReturnValue(throwError(() => new Error('boom')));
      const getListings = vi.fn().mockReturnValue(throwError(() => new Error('boom')));
      const { harness, effects } = setup({ listingsApi: { getMapPins, getListings } });

      const collected = collect(effects.loadNearbyPinsForOrigin$);
      harness.send(
        HomeNearbyActions.originResolved({
          origin: { lat: 40.2, lng: 44.6 },
          accuracyMeters: null,
        }),
      );
      harness.complete();

      expect(await collected).toEqual([HomeNearbyActions.pinsLoadFailure({ error: 'boom' })]);
    });
  });

  describe('loadNearbyPinsForYerevan$ (fallback branch — default on init, or a denied/failed requestMyArea)', () => {
    it('derives nearbyCount from items.length when the fallback fetch is NOT truncated — the length IS the true count', async () => {
      const pinA = makeListingMapPin({ id: 'a', latitude: 40.18, longitude: 44.51 });
      const pinB = makeListingMapPin({ id: 'b', latitude: 40.19, longitude: 44.52 });
      const getMapPins = vi.fn().mockReturnValue(of({ items: [pinA, pinB], isTruncated: false }));
      const { harness, effects } = setup({ listingsApi: { getMapPins } });

      const collected = collect(effects.loadNearbyPinsForYerevan$);
      harness.send(HomeNearbyActions.useFallbackOrigin());
      harness.complete();

      expect(await collected).toEqual([
        HomeNearbyActions.pinsLoadSuccess({
          pins: [
            {
              key: '40.180000,44.510000',
              position: { lat: 40.18, lng: 44.51 },
              count: 1,
            },
            {
              key: '40.190000,44.520000',
              position: { lat: 40.19, lng: 44.52 },
              count: 1,
            },
          ],
          // Not truncated -> the backend returned EVERY pin in the box, so
          // items.length is an honest count, not an estimate.
          nearbyCount: 2,
        }),
      ]);
      expect(getMapPins).toHaveBeenCalledWith(
        initialListingsState.filters,
        expect.objectContaining({
          minLat: expect.any(Number),
          maxLat: expect.any(Number),
          minLng: expect.any(Number),
          maxLng: expect.any(Number),
        }),
        null,
      );
    });

    it('leaves nearbyCount null (pill hidden) when the fallback fetch IS truncated — a floor is not a count (M-027)', async () => {
      const pin = makeListingMapPin({ latitude: 40.18, longitude: 44.51 });
      const getMapPins = vi.fn().mockReturnValue(of({ items: [pin], isTruncated: true }));
      const { harness, effects } = setup({ listingsApi: { getMapPins } });

      const collected = collect(effects.loadNearbyPinsForYerevan$);
      harness.send(HomeNearbyActions.useFallbackOrigin());
      harness.complete();

      expect(await collected).toEqual([
        HomeNearbyActions.pinsLoadSuccess({
          pins: [
            {
              key: '40.180000,44.510000',
              position: { lat: 40.18, lng: 44.51 },
              count: 1,
            },
          ],
          nearbyCount: null,
        }),
      ]);
    });

    it('emits pinsLoadFailure when the fallback fetch errors', async () => {
      const getMapPins = vi.fn().mockReturnValue(throwError(() => new Error('offline')));
      const { harness, effects } = setup({ listingsApi: { getMapPins } });

      const collected = collect(effects.loadNearbyPinsForYerevan$);
      harness.send(HomeNearbyActions.useFallbackOrigin());
      harness.complete();

      expect(await collected).toEqual([HomeNearbyActions.pinsLoadFailure({ error: 'offline' })]);
    });
  });
});
