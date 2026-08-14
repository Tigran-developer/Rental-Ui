import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { makeListingPreview } from '../../../../../testing/fixtures';
import { GeolocationService } from '../../../../shared/services/geolocation.service';
import { selectIsAuthenticated } from '../../../auth/store/auth.selectors';
import { MyListingsApiService } from '../../../my-listings/services/my-listings-api.service';
import { selectMyBookings } from '../../../bookings/store/bookings.selectors';
import { selectFavoriteIds } from '../../../favorites/store/favorites.selectors';
import * as ListingsActions from '../../store/listings.actions';
import {
  selectListingCategories,
  selectListingItems,
  selectListingsError,
  selectListingsFilters,
  selectListingsHasMore,
  selectListingsLoading,
  selectListingsOriginCoords,
  selectListingsOriginDenied,
  selectListingsOriginSource,
  selectListingsPageSize,
  selectMapPins,
  selectMapPinsError,
  selectMapPinsLoading,
  selectMapPinsTruncated,
} from '../../store/listings.selectors';
import { ListingsApiService } from '../../services/listings-api.service';
import { ListingsPageComponent } from './listings-page.component';

/**
 * This page has no OTHER spec today (a known, pre-existing gap — see the
 * Maps P2-2 plan). This file is deliberately narrow: it covers ONLY the new
 * `?view=map` behaviour (map renders + grid hides, the toggle merge-navigates,
 * and `view` never leaks into the API filter payload) — not a retrofit of
 * coverage for the rest of the page.
 *
 * The page's full template tree is mounted for real (not stubbed) — its
 * sidebar `app-radius-origin-filter` and the new `app-listings-map` both
 * eventually mount the real `app-map`, which dynamic-imports `leaflet` (the
 * only file allowed to import it) — mocked here the same way every other
 * spec touching `app-map` does. `ListingsApiService`/`MyListingsApiService`
 * are replaced with trivial fakes (no `HttpClient` needed) purely so the
 * page's own direct injections resolve; `provideMockStore` means dispatched
 * actions never reach real reducers/effects, so no HTTP call is ever
 * actually attempted regardless.
 */
vi.mock('leaflet', () => ({
  default: {
    map: vi.fn(() => ({
      setView: vi.fn(),
      on: vi.fn(),
      getCenter: vi.fn(() => ({ lat: 40.1776, lng: 44.5126 })),
      getZoom: vi.fn(() => 13),
      latLngToContainerPoint: vi.fn(() => ({ x: 0, y: 0 })),
      getBounds: vi.fn(() => ({
        getNorth: () => 40.2,
        getSouth: () => 40.1,
        getEast: () => 44.6,
        getWest: () => 44.5,
      })),
      invalidateSize: vi.fn(),
      removeLayer: vi.fn(),
      remove: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      fitBounds: vi.fn(),
      dragging: { enable: vi.fn(), disable: vi.fn(), enabled: vi.fn(() => false) },
      touchZoom: { enable: vi.fn(), disable: vi.fn(), enabled: vi.fn(() => false) },
    })),
    tileLayer: vi.fn(() => {
      const layer = { addTo: vi.fn(() => layer), on: vi.fn(() => layer) };
      return layer;
    }),
    marker: vi.fn(() => ({ addTo: vi.fn(function (this: unknown) { return this; }), getElement: vi.fn(() => null), setLatLng: vi.fn() })),
    circle: vi.fn(() => {
      const c = { addTo: vi.fn(() => c) };
      return c;
    }),
    divIcon: vi.fn((options: Record<string, unknown>) => ({ ...options })),
    latLngBounds: vi.fn((points: unknown) => ({ __bounds: true, points })),
  },
}));

vi.stubGlobal(
  'matchMedia',
  vi.fn(() => ({
    matches: false,
    media: '',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    onchange: null,
  })),
);

class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', FakeResizeObserver);

/**
 * Captures the callback the component registers so a test can fire a
 * synthetic intersection event, and records every instance created so a test
 * can grab the observer attached to the infinite-scroll sentinel. Installed
 * on `globalThis` at module load — i.e. before any `TestBed.createComponent`
 * — because `ListingsPageComponent.intersectionObserverSupported` reads
 * `typeof IntersectionObserver !== 'undefined'` at field-initialiser time.
 */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];

  constructor(private readonly callback: (entries: [{ isIntersecting: boolean }]) => void) {
    FakeIntersectionObserver.instances.push(this);
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}

  trigger(isIntersecting: boolean): void {
    this.callback([{ isIntersecting }]);
  }
}
vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

const BASE_FILTERS = {
  query: null,
  city: null,
  categoryId: null,
  minPrice: null,
  maxPrice: null,
  ageGroup: null,
  radiusKm: null,
  districtIds: [],
};

interface ListingsPageSelectorOverrides {
  readonly hasMore?: boolean;
  readonly loading?: boolean;
  readonly error?: string | null;
}

async function navigateToListings(url: string, overrides: ListingsPageSelectorOverrides = {}) {
  FakeIntersectionObserver.instances = [];

  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([{ path: 'listings', component: ListingsPageComponent }]),
      provideMockStore({
        selectors: [
          { selector: selectIsAuthenticated, value: false },
          { selector: selectFavoriteIds, value: new Set<string>() },
          { selector: selectListingCategories, value: [] },
          { selector: selectListingItems, value: [makeListingPreview()] },
          { selector: selectListingsError, value: overrides.error ?? null },
          { selector: selectListingsFilters, value: BASE_FILTERS },
          { selector: selectListingsHasMore, value: overrides.hasMore ?? false },
          { selector: selectListingsLoading, value: overrides.loading ?? false },
          { selector: selectListingsOriginCoords, value: null },
          { selector: selectListingsOriginSource, value: null },
          { selector: selectListingsOriginDenied, value: false },
          { selector: selectListingsPageSize, value: 20 },
          { selector: selectMyBookings, value: [] },
          { selector: selectMapPins, value: [] },
          { selector: selectMapPinsLoading, value: false },
          { selector: selectMapPinsError, value: null },
          { selector: selectMapPinsTruncated, value: false },
        ],
      }),
      { provide: ListingsApiService, useValue: { getDistricts: () => of([]) } },
      { provide: MyListingsApiService, useValue: { getMyListings: () => of([]) } },
      { provide: GeolocationService, useValue: { getCurrentPosition: () => Promise.reject(new Error('denied')) } },
    ],
    teardown: { destroyAfterEach: true },
  });

  // Spy BEFORE navigating — the constructor's `queryParamMap` subscription
  // dispatches `updateFilters`/`loadListings` synchronously on the FIRST
  // navigation, so a spy set up afterward would miss it entirely.
  const store = TestBed.inject(MockStore);
  vi.spyOn(store, 'dispatch');

  const harness = await RouterTestingHarness.create();
  const component = await harness.navigateByUrl(url, ListingsPageComponent);
  harness.detectChanges();

  return {
    harness,
    component,
    el: harness.routeNativeElement as HTMLElement,
    router: TestBed.inject(Router),
    store,
  };
}

describe('ListingsPageComponent — Maps P2-2 view toggle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders the map and hides the results grid when `?view=map` is in the URL', async () => {
    const { el } = await navigateToListings('/listings?view=map');

    expect(el.querySelector('app-listings-map')).not.toBeNull();
    expect(el.querySelector('.listings-page__grid')).toBeNull();
  });

  it('renders the grid (not the map) with no `view` param, even though the toggle is present', async () => {
    const { el } = await navigateToListings('/listings');

    expect(el.querySelector('.listings-page__grid')).not.toBeNull();
    expect(el.querySelector('app-listings-map')).toBeNull();
    expect(el.querySelector('.lp-view-toggle')).not.toBeNull();
  });

  it('the Map/List toggle navigates with query params MERGED, not replaced', async () => {
    const { el, router } = await navigateToListings('/listings?categoryId=abc-123');

    const buttons = el.querySelectorAll<HTMLButtonElement>('.lp-view-toggle__btn');
    expect(buttons).toHaveLength(2);
    const [listBtn, mapBtn] = Array.from(buttons);

    mapBtn.click();
    await vi.advanceTimersByTimeAsync(50);

    expect(router.url).toContain('view=map');
    expect(router.url).toContain('categoryId=abc-123');

    listBtn.click();
    await vi.advanceTimersByTimeAsync(50);

    // Switching back to 'list' clears the param entirely rather than
    // writing `view=list` — keeps the URL clean for the default mode.
    expect(router.url).not.toContain('view=');
    expect(router.url).toContain('categoryId=abc-123');
  });

  it('never sends `view` to the API filter payload — `updateFilters` is dispatched with the SAME shape whether or not `view` is in the URL', async () => {
    const { store } = await navigateToListings('/listings?view=map&categoryId=abc-123');

    const updateFiltersCalls = (store.dispatch as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0])
      .filter((action) => action.type === ListingsActions.updateFilters.type);

    expect(updateFiltersCalls.length).toBeGreaterThan(0);
    const lastCall = updateFiltersCalls.at(-1);
    expect(lastCall.filters).toEqual({ ...BASE_FILTERS, categoryId: 'abc-123' });
    expect(Object.prototype.hasOwnProperty.call(lastCall.filters, 'view')).toBe(false);
  });
});

/**
 * Infinite scroll: replaces the manual "Load more" button with an
 * `IntersectionObserver` on a sentinel rendered after the grid (only in
 * list view, only while `hasMore && !hasError` — see the template). The
 * component's dispatch guard lives in a `Signal` effect that re-evaluates
 * on every `vm()`/`viewMode()` change, not just on intersection-boundary
 * crossings — see `listings-page.component.ts` for why. `FakeIntersectionObserver`
 * (module scope, above) records the callback the component registers so
 * these tests can fire a synthetic intersection event by hand.
 */
describe('ListingsPageComponent — infinite scroll', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function flush(harness: RouterTestingHarness) {
    harness.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    harness.detectChanges();
  }

  function loadNextPageDispatches(store: MockStore) {
    return (store.dispatch as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => call[0])
      .filter((action) => action.type === ListingsActions.loadNextPage.type);
  }

  it('dispatches loadNextPage when the sentinel intersects', async () => {
    const { harness, el, store } = await navigateToListings('/listings', {
      hasMore: true,
      loading: false,
      error: null,
    });

    const sentinel = el.querySelector('.listings-page__scroll-sentinel');
    expect(sentinel).not.toBeNull();
    expect(sentinel!.getAttribute('aria-hidden')).toBe('true');

    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    FakeIntersectionObserver.instances[0].trigger(true);
    await flush(harness);

    expect(loadNextPageDispatches(store)).toHaveLength(1);
  });

  it('does not dispatch while a page is already loading', async () => {
    const { harness, el, store } = await navigateToListings('/listings', {
      hasMore: true,
      loading: true,
      error: null,
    });

    // The sentinel stays mounted while loading (it only depends on
    // hasMore/hasError) — the append skeleton is the visible "loading"
    // indicator; the guard against a duplicate/in-flight dispatch lives in
    // the effect, not in whether the sentinel exists.
    expect(el.querySelector('.listings-page__scroll-sentinel')).not.toBeNull();

    FakeIntersectionObserver.instances[0].trigger(true);
    await flush(harness);

    expect(loadNextPageDispatches(store)).toHaveLength(0);
  });

  it('does not dispatch when hasMore is false', async () => {
    const { el, store } = await navigateToListings('/listings', {
      hasMore: false,
      loading: false,
      error: null,
    });

    // Nothing left to load ⇒ the template never renders the sentinel, so
    // there is nothing for an IntersectionObserver to fire on.
    expect(el.querySelector('.listings-page__scroll-sentinel')).toBeNull();
    expect(loadNextPageDispatches(store)).toHaveLength(0);
  });

  it('does not dispatch in map view', async () => {
    const { harness, el, store } = await navigateToListings('/listings', {
      hasMore: true,
      loading: false,
      error: null,
    });

    expect(el.querySelector('.listings-page__scroll-sentinel')).not.toBeNull();
    const observer = FakeIntersectionObserver.instances[0];

    // Switch to map view — the sentinel's `@if` (list view only) removes it
    // from the DOM and the attach effect disconnects the real observer, but
    // `observer` here still holds the callback closure, letting the test
    // simulate a stale/late browser callback racing the view switch.
    await harness.navigateByUrl('/listings?view=map', ListingsPageComponent);
    await flush(harness);

    expect(el.querySelector('.listings-page__scroll-sentinel')).toBeNull();
    expect(el.querySelector('app-listings-map')).not.toBeNull();

    observer.trigger(true);
    await flush(harness);

    expect(loadNextPageDispatches(store)).toHaveLength(0);
  });
});
