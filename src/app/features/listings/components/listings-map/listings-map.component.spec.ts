import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { makeListingMapPin } from '../../../../../testing/fixtures';
import type { ListingsFilter } from '../../models/listings-filter.model';
import * as ListingsActions from '../../store/listings.actions';
import {
  selectListingsFilters,
  selectMapPins,
  selectMapPinsError,
  selectMapPinsLoading,
  selectMapPinsTruncated,
} from '../../store/listings.selectors';
import { ListingsMapComponent } from './listings-map.component';

/**
 * `ListingsMapComponent` mounts the REAL `app-map` (not a stub) so these
 * tests exercise the actual wiring — a real marker DOM element's
 * mouseover/mouseout/click really does flow through `MapComponent`'s own
 * event handling into this component's hover/pin state machine, and a real
 * `moveend` really does flow through the debounce into a `loadMapPins`
 * dispatch. `leaflet` itself is mocked (the only file allowed to import it
 * is `map.component.ts`) — same fake shape `map.component.spec.ts` uses,
 * trimmed to what this integration needs: marker creation with a real
 * (detached) DOM element, and a generic per-event handler registry for
 * `moveend`/`click`/`fitBounds`.
 */
const state = vi.hoisted(() => ({
  markerCalls: [] as { coords: [number, number]; options: Record<string, unknown>; element: HTMLElement | null }[],
  eventHandlers: {} as Record<string, (() => void)[]>,
  fitBoundsCalls: [] as unknown[],
  fakeContainerPoint: { x: 100, y: 200 },
  fakeBounds: { getNorth: 40.2, getSouth: 40.1, getEast: 44.6, getWest: 44.5 },
}));

function makeFakeMap() {
  return {
    setView: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => {
      (state.eventHandlers[event] ??= []).push(handler);
    }),
    getCenter: vi.fn(() => ({ lat: 40.1776, lng: 44.5126 })),
    getZoom: vi.fn(() => 13),
    latLngToContainerPoint: vi.fn(() => state.fakeContainerPoint),
    getBounds: vi.fn(() => ({
      getNorth: () => state.fakeBounds.getNorth,
      getSouth: () => state.fakeBounds.getSouth,
      getEast: () => state.fakeBounds.getEast,
      getWest: () => state.fakeBounds.getWest,
    })),
    invalidateSize: vi.fn(),
    removeLayer: vi.fn(),
    remove: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fitBounds: vi.fn(() => {
      state.fitBoundsCalls.push(true);
      // Mirrors real Leaflet's `animate:false` synchronous `moveend` —
      // needed so `MapComponent`'s own `suppressNextMoveend` guard has a
      // real event to swallow (see map.component.spec.ts for the same
      // pattern).
      state.eventHandlers['moveend']?.forEach((h) => h());
    }),
    dragging: { enable: vi.fn(), disable: vi.fn(), enabled: vi.fn(() => false) },
    touchZoom: { enable: vi.fn(), disable: vi.fn(), enabled: vi.fn(() => false) },
  };
}

vi.mock('leaflet', () => ({
  default: {
    map: vi.fn(() => makeFakeMap()),
    tileLayer: vi.fn(() => {
      const layer = { addTo: vi.fn(() => layer), on: vi.fn(() => layer) };
      return layer;
    }),
    marker: vi.fn((coords: [number, number], options: Record<string, unknown>) => {
      const iconOptions = options['icon'] as Record<string, unknown> | undefined;
      let element: HTMLElement | null = null;
      if (iconOptions && typeof iconOptions['html'] === 'string') {
        element = document.createElement('div');
        element.className = String(iconOptions['className'] ?? '');
        element.innerHTML = iconOptions['html'] as string;
      }
      state.markerCalls.push({ coords, options, element });
      const fakeMarker = {
        addTo: vi.fn(() => fakeMarker),
        getElement: vi.fn(() => element),
        setLatLng: vi.fn(),
      };
      return fakeMarker;
    }),
    circle: vi.fn(() => {
      const fakeCircle = { addTo: vi.fn(() => fakeCircle) };
      return fakeCircle;
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

const BASE_FILTERS: ListingsFilter = {
  query: null,
  city: null,
  categoryId: null,
  minPrice: null,
  maxPrice: null,
  ageGroup: null,
  radiusKm: null,
  districtIds: [],
};

interface Testable {
  fitPinsPulse: () => boolean;
  openKey: () => string | null;
}

async function createHarness(pins = [makeListingMapPin()]) {
  TestBed.configureTestingModule({
    imports: [ListingsMapComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      provideMockStore({
        selectors: [
          { selector: selectListingsFilters, value: BASE_FILTERS },
          { selector: selectMapPins, value: pins },
          { selector: selectMapPinsLoading, value: false },
          { selector: selectMapPinsError, value: null },
          { selector: selectMapPinsTruncated, value: false },
        ],
      }),
    ],
  });

  const translate = TestBed.inject(TranslateService);
  translate.setTranslation(
    'en',
    {
      listings: {
        details: { location: { zoomIn: 'Zoom in', zoomOut: 'Zoom out' } },
        map: {
          marker: { single: 'Toy here', group: '{count} toys here' },
          popup: { viewButton: 'View toy', close: 'Close' },
          stack: { heading: '{{count}} toys here' },
          truncated: { title: 'Partial results', description: 'Zoom in or narrow filters.' },
          loading: 'Loading map…',
          error: { message: 'Could not load', retry: 'Try again' },
          empty: 'Nothing here',
        },
        createForm: {
          perUnit: { hourly: '/ hour', daily: '/ day', weekly: '/ week', monthly: '/ month', yearly: '/ year' },
        },
      },
      reviews: { summary: { ariaRating: '{{rating}}/5', noReviews: 'No reviews' } },
    },
    true,
  );
  translate.use('en');

  const store = TestBed.inject(MockStore);
  vi.spyOn(store, 'dispatch');

  const fixture = TestBed.createComponent(ListingsMapComponent);
  fixture.detectChanges();
  await vi.runAllTimersAsync();
  fixture.detectChanges();

  return {
    fixture,
    store,
    el: fixture.nativeElement as HTMLElement,
    component: fixture.componentInstance as unknown as Testable,
  };
}

describe('ListingsMapComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.markerCalls = [];
    state.eventHandlers = {};
    state.fitBoundsCalls = [];
    state.fakeContainerPoint = { x: 100, y: 200 };
    state.fakeBounds = { getNorth: 40.2, getSouth: 40.1, getEast: 44.6, getWest: 44.5 };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispatches an initial (bounds: null) fetch on mount', async () => {
    const { store } = await createHarness();
    expect(store.dispatch).toHaveBeenCalledWith(ListingsActions.loadMapPins({ bounds: null }));
  });

  it('groups pins sharing a coordinate into ONE marker with the combined count', async () => {
    const pins = [
      makeListingMapPin({ id: 'a', latitude: 40.18, longitude: 44.51 }),
      makeListingMapPin({ id: 'b', latitude: 40.18, longitude: 44.51 }),
      makeListingMapPin({ id: 'c', latitude: 40.2, longitude: 44.55 }),
    ];
    await createHarness(pins);

    expect(state.markerCalls).toHaveLength(2);
    const badgeCounts = state.markerCalls
      .map((call) => call.element?.querySelector('.app-map__pin-badge')?.textContent ?? null)
      .filter((text): text is string => text !== null);
    expect(badgeCounts).toEqual(['2']);
  });

  it('debounces `viewportChanged` 400ms before dispatching a bounds-scoped `loadMapPins`', async () => {
    const { store } = await createHarness();
    (store.dispatch as ReturnType<typeof vi.fn>).mockClear();

    state.eventHandlers['moveend']?.forEach((h) => h());
    expect(store.dispatch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(399);
    expect(store.dispatch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(store.dispatch).toHaveBeenCalledWith(
      ListingsActions.loadMapPins({
        bounds: { minLat: 40.1, maxLat: 40.2, minLng: 44.5, maxLng: 44.6 },
      }),
    );
  });

  it('does NOT auto-fit (`fitBounds`) for a viewport-driven response, only for the initial/filter-driven one', async () => {
    const pins = [
      makeListingMapPin({ id: 'a', latitude: 40.18, longitude: 44.51 }),
      makeListingMapPin({ id: 'b', latitude: 40.2, longitude: 44.55 }),
    ];
    const { fixture, store } = await createHarness(pins);

    // The initial (bounds: null) fetch "resolves" — loading flips true then
    // false while it was the awaited initial kind, so this SHOULD fit.
    store.overrideSelector(selectMapPinsLoading, true);
    store.refreshState();
    fixture.detectChanges();
    store.overrideSelector(selectMapPinsLoading, false);
    store.refreshState();
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    expect(state.fitBoundsCalls).toHaveLength(1);

    // Now a real pan triggers the debounced viewport fetch.
    state.eventHandlers['moveend']?.forEach((h) => h());
    await vi.advanceTimersByTimeAsync(400); // flush the 400ms viewport debounce
    (store.dispatch as ReturnType<typeof vi.fn>).mockClear();

    // That viewport-driven fetch resolves too (loading true -> false again)
    // — this one must NOT fit.
    store.overrideSelector(selectMapPinsLoading, true);
    store.refreshState();
    fixture.detectChanges();
    store.overrideSelector(selectMapPinsLoading, false);
    store.refreshState();
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    expect(state.fitBoundsCalls).toHaveLength(1); // still just the one
  });

  it('opens a popup on hover and keeps it open (via the 150ms grace) when the pointer moves onto it', async () => {
    const { fixture, el } = await createHarness([makeListingMapPin({ title: 'Wooden Train Set' })]);
    const marker = state.markerCalls[0].element!;

    marker.dispatchEvent(new MouseEvent('mouseover'));
    fixture.detectChanges();
    expect(el.querySelector('.listings-map__popup-anchor')).not.toBeNull();
    expect(el.textContent).toContain('Wooden Train Set');

    marker.dispatchEvent(new MouseEvent('mouseout'));
    fixture.detectChanges();
    // Grace period hasn't elapsed — the popup must still be there so the
    // pointer can actually reach it.
    await vi.advanceTimersByTimeAsync(50);
    fixture.detectChanges();
    const anchorEl = el.querySelector('.listings-map__popup-anchor');
    expect(anchorEl).not.toBeNull();

    // Pointer reaches the popup before the grace timer fires.
    anchorEl!.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(200);
    fixture.detectChanges();
    expect(el.querySelector('.listings-map__popup-anchor')).not.toBeNull();
  });

  it('closes the popup after the 150ms grace when the pointer never reaches it', async () => {
    const { fixture, el } = await createHarness();
    const marker = state.markerCalls[0].element!;

    marker.dispatchEvent(new MouseEvent('mouseover'));
    fixture.detectChanges();
    expect(el.querySelector('.listings-map__popup-anchor')).not.toBeNull();

    marker.dispatchEvent(new MouseEvent('mouseout'));
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(150);
    fixture.detectChanges();
    expect(el.querySelector('.listings-map__popup-anchor')).toBeNull();
  });

  it('renders one popup card per pin when a group has `count > 1`, under a heading', async () => {
    const pins = [
      makeListingMapPin({ id: 'a', latitude: 40.18, longitude: 44.51, title: 'Toy A' }),
      makeListingMapPin({ id: 'b', latitude: 40.18, longitude: 44.51, title: 'Toy B' }),
    ];
    const { fixture, el } = await createHarness(pins);
    const marker = state.markerCalls[0].element!;

    marker.dispatchEvent(new MouseEvent('mouseover'));
    fixture.detectChanges();

    const stack = el.querySelector('.listings-map__popup-stack');
    expect(stack).not.toBeNull();
    expect(stack!.querySelectorAll('app-listings-map-popup')).toHaveLength(2);
    expect(el.textContent).toContain('Toy A');
    expect(el.textContent).toContain('Toy B');
  });

  it('pins a popup open on click (no hover-out close), and Esc closes it', async () => {
    const { fixture, el, component } = await createHarness();
    const marker = state.markerCalls[0].element!;

    marker.dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();
    expect(el.querySelector('.listings-map__popup-anchor')).not.toBeNull();
    expect(component.openKey()).not.toBeNull();

    // A stray mouseout must NOT close a pinned popup.
    marker.dispatchEvent(new MouseEvent('mouseout'));
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(300);
    fixture.detectChanges();
    expect(el.querySelector('.listings-map__popup-anchor')).not.toBeNull();

    el.querySelector('.listings-map')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    expect(el.querySelector('.listings-map__popup-anchor')).toBeNull();
    expect(component.openKey()).toBeNull();
  });

  it('shows the truncated-results banner when `selectMapPinsTruncated` is true', async () => {
    TestBed.configureTestingModule({
      imports: [ListingsMapComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideMockStore({
          selectors: [
            { selector: selectListingsFilters, value: BASE_FILTERS },
            { selector: selectMapPins, value: [] },
            { selector: selectMapPinsLoading, value: false },
            { selector: selectMapPinsError, value: null },
            { selector: selectMapPinsTruncated, value: true },
          ],
        }),
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation(
      'en',
      {
        listings: {
          map: {
            truncated: { title: 'Partial results', description: 'Zoom in or narrow filters.' },
          },
        },
      },
      true,
    );
    translate.use('en');

    const fixture = TestBed.createComponent(ListingsMapComponent);
    fixture.detectChanges();
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.listings-map__banner--truncated')).not.toBeNull();
    expect(el.textContent).toContain('Partial results');
  });
});
