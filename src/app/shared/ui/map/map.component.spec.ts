import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { MapComponent, resolveTileSource, TILE_PROVIDER_CONFIG } from './map.component';
import type { MapBounds, MapLatLng, MapMarkerAnchor, MapMarkerGroup } from './map.component';

/**
 * `app-map` is the only file allowed to import `leaflet` (see the class doc
 * comment) — everything else, including this spec, must stay ignorant of the
 * real library. Mocking the module lets these tests pin down the *wiring*
 * (which options Leaflet gets, marker add/remove, `centerChange` emission)
 * without needing a real DOM-measured map or network tiles.
 */
const state = vi.hoisted(() => ({
  mapOptions: null as Record<string, unknown> | null,
  tileLayerCalls: [] as {
    url: string;
    options: Record<string, unknown>;
    handlers: Record<string, (() => void)[]>;
  }[],
  markerCalls: [] as {
    coords: [number, number];
    options: Record<string, unknown>;
    element: HTMLElement | null;
  }[],
  circleCalls: [] as {
    coords: [number, number];
    options: Record<string, unknown>;
    handlers: Record<string, ((event?: unknown) => void)[]>;
  }[],
  divIconCalls: [] as Record<string, unknown>[],
  latLngBoundsCalls: [] as unknown[],
  fitBoundsCalls: [] as { bounds: unknown; options: Record<string, unknown> }[],
  removedLayers: [] as unknown[],
  moveendHandlers: [] as (() => void)[],
  // Generic per-event handler registry — covers `move`/`zoom`/`zoomend` (the
  // multi-marker anchor-tracking/circle-threshold wiring), in addition to the
  // `moveend`-specific array above which older tests already rely on.
  eventHandlers: {} as Record<string, (() => void)[]>,
  fakeCenter: { lat: 40.1776, lng: 44.5126 },
  // Drives `Leaflet.Map.getZoom()` for the marker-circle min-zoom gate.
  fakeZoom: 13,
  // Drives `Leaflet.Map.latLngToContainerPoint()` for marker anchor tracking.
  fakeContainerPoint: { x: 111, y: 222 },
  latLngToContainerPointCalls: [] as unknown[],
  // Drives `Leaflet.Map.getBounds()` for `viewportChanged`.
  fakeBounds: { getNorth: 40.2, getSouth: 40.1, getEast: 44.6, getWest: 44.5 },
  mapRemoved: false,
  mapThrows: false,
  // Reassigned to the most recently created fake map's `invalidateSize` spy —
  // lets tests assert the ResizeObserver wiring calls it without needing a
  // handle on the map instance itself (which `map.component.ts` never exposes).
  lastInvalidateSize: null as ReturnType<typeof vi.fn> | null,
  // Drives the `matchMedia('(pointer: coarse)')` stub below — flips whether
  // `map.component.ts`'s `isTouchCapable` (read once, at construction) comes
  // out `true` or `false` for the NEXT component created.
  pointerCoarse: false,
  // Drives the `matchMedia('(prefers-reduced-motion: reduce)')` stub below —
  // read once, at construction, by `MapComponent`'s own
  // `prefersReducedMotionForMarkers` (M-024 regression: must be set BEFORE
  // the fixture is created for a given test).
  prefersReducedMotion: false,
  // Spies on the fake map's `dragging`/`touchZoom` handlers so tests can
  // assert `dismissTouchGate()` actually re-enables them.
  lastDraggingEnable: null as ReturnType<typeof vi.fn> | null,
  lastTouchZoomEnable: null as ReturnType<typeof vi.fn> | null,
  // Spies on the most recently created fake map's `zoomIn`/`zoomOut` — same
  // "reassigned per instance" pattern as `lastInvalidateSize` above.
  lastZoomIn: null as ReturnType<typeof vi.fn> | null,
  lastZoomOut: null as ReturnType<typeof vi.fn> | null,
}));

function makeFakeMap(options: Record<string, unknown>) {
  state.mapOptions = options;
  const invalidateSize = vi.fn();
  state.lastInvalidateSize = invalidateSize;
  const draggingEnable = vi.fn();
  const touchZoomEnable = vi.fn();
  const zoomIn = vi.fn();
  const zoomOut = vi.fn();
  state.lastDraggingEnable = draggingEnable;
  state.lastTouchZoomEnable = touchZoomEnable;
  state.lastZoomIn = zoomIn;
  state.lastZoomOut = zoomOut;
  return {
    setView: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => {
      if (event === 'moveend') state.moveendHandlers.push(handler);
      (state.eventHandlers[event] ??= []).push(handler);
    }),
    getCenter: vi.fn(() => state.fakeCenter),
    getZoom: vi.fn(() => state.fakeZoom),
    latLngToContainerPoint: vi.fn((latlng: unknown) => {
      state.latLngToContainerPointCalls.push(latlng);
      return state.fakeContainerPoint;
    }),
    getBounds: vi.fn(() => ({
      getNorth: () => state.fakeBounds.getNorth,
      getSouth: () => state.fakeBounds.getSouth,
      getEast: () => state.fakeBounds.getEast,
      getWest: () => state.fakeBounds.getWest,
    })),
    invalidateSize,
    removeLayer: vi.fn((layer: unknown) => state.removedLayers.push(layer)),
    remove: vi.fn(() => {
      state.mapRemoved = true;
    }),
    zoomIn,
    zoomOut,
    fitBounds: vi.fn((bounds: unknown, fitOptions: Record<string, unknown>) => {
      state.fitBoundsCalls.push({ bounds, options: fitOptions });
      // Mirrors real Leaflet: `fitBounds(..., { animate: false })` calls
      // `setView` synchronously, which fires `moveend` synchronously in the
      // same call stack when the view actually changes — needed so
      // `map.component.ts`'s own `suppressNextMoveend` guard (see its doc
      // comment) has a REAL synchronous `moveend` to swallow in tests,
      // rather than the mock only ever recording that it was "called" with
      // no observable consequence.
      state.moveendHandlers.forEach((h) => h());
    }),
    dragging: { enable: draggingEnable, disable: vi.fn(), enabled: vi.fn(() => false) },
    touchZoom: { enable: touchZoomEnable, disable: vi.fn(), enabled: vi.fn(() => false) },
  };
}

/**
 * jsdom has no native `ResizeObserver` — this fake stands in for the global so
 * `map.component.ts`'s `new ResizeObserver(...)` doesn't throw, and lets tests
 * both assert the wiring (`observe()` called with the map container) and
 * simulate a real box-resize by invoking the captured callback directly. One
 * instance is expected per mounted `app-map`; `resizeObserverInstances` is
 * reset in `beforeEach` below.
 */
let resizeObserverInstances: FakeResizeObserver[] = [];
class FakeResizeObserver {
  readonly observed: unknown[] = [];
  disconnected = false;
  constructor(private readonly callback: () => void) {
    resizeObserverInstances.push(this);
  }
  observe(target: unknown): void {
    this.observed.push(target);
  }
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  /** Simulates the browser reporting a real box-size change. */
  trigger(): void {
    this.callback();
  }
}
vi.stubGlobal('ResizeObserver', FakeResizeObserver);

/**
 * jsdom has no `matchMedia` either. `map.component.ts` reads
 * `matchMedia('(pointer: coarse)')` (`isTouchCapable`) AND
 * `matchMedia('(prefers-reduced-motion: reduce)')` (`prefersReducedMotionForMarkers`
 * — the M-024 regression guard for hover-driven marker bounce) exactly once
 * per instance, at construction — so `state.pointerCoarse`/
 * `state.prefersReducedMotion` must be set BEFORE `TestBed.createComponent()`
 * for a given test, not after. Every other media query falls back to
 * `matches: false`.
 */
vi.stubGlobal(
  'matchMedia',
  vi.fn(
    (query: string) =>
      ({
        matches:
          (query === '(pointer: coarse)' && state.pointerCoarse) ||
          (query === '(prefers-reduced-motion: reduce)' && state.prefersReducedMotion),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => true),
        onchange: null,
      }) as unknown as MediaQueryList,
  ),
);

// Mocked as CJS-default-only — i.e. `{ default: { map, tileLayer, ... } }`
// with NO flattened top-level named exports — because that is the exact
// shape a production `ng build` (esbuild) produces for this dynamic import,
// as opposed to `ng serve` (Vite), which flattens them onto the namespace
// object directly. `map.component.ts`'s `resolveLeafletModule()` must unwrap
// this; mocking the harsher of the two real shapes means every test below
// also guards against regressing back to calling `L.map(...)` on the raw
// import result (see the bug this fixed: that call silently threw
// "L.map is not a function" and was swallowed into `mapError` in every
// production build).
vi.mock('leaflet', () => ({
  default: {
    map: vi.fn((_el: HTMLElement, options: Record<string, unknown>) => {
      if (state.mapThrows) throw new Error('boom');
      return makeFakeMap(options);
    }),
    tileLayer: vi.fn((url: string, options: Record<string, unknown>) => {
      const handlers: Record<string, (() => void)[]> = {};
      const layer = {
        addTo: vi.fn(() => layer),
        on: vi.fn((event: string, handler: () => void) => {
          (handlers[event] ??= []).push(handler);
          return layer;
        }),
      };
      state.tileLayerCalls.push({ url, options, handlers });
      return layer;
    }),
    // Builds a REAL (detached) DOM element from the `divIcon` options passed
    // via `options.icon` when there is one — `map.component.ts`'s multi-
    // marker code calls `marker.getElement()` and attaches native
    // `mouseover`/`mouseout`/`click`/`keydown`/`animationiteration` listeners
    // directly to it (see `createMarkerEntry()`), so the fake has to hand
    // back a real, listener-capable node, not a plain object. `addTo()`
    // returns the marker itself (mirroring real Leaflet) rather than
    // `undefined` — needed so `map.removeLayer(entry.marker)` in
    // `syncMarkerGroups()` records the actual marker object being removed.
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
    // `on()` (needed by the per-group circles' hover/click wiring — see
    // `syncMarkerGroupCircles()` in map.component.ts) captures handlers into
    // THIS circle call's own `handlers` bag, mirroring the `tileLayer` fake
    // above — `circleCalls[i].handlers['click']?.forEach((h) => h())` lets a
    // test simulate a Leaflet layer event without needing a real Leaflet
    // renderer.
    circle: vi.fn((coords: [number, number], options: Record<string, unknown>) => {
      const handlers: Record<string, ((event?: unknown) => void)[]> = {};
      const call = { coords, options, handlers };
      state.circleCalls.push(call);
      const fakeCircle = {
        addTo: vi.fn(() => fakeCircle),
        on: vi.fn((event: string, handler: (event?: unknown) => void) => {
          (handlers[event] ??= []).push(handler);
          return fakeCircle;
        }),
      };
      return fakeCircle;
    }),
    divIcon: vi.fn((options: Record<string, unknown>) => {
      state.divIconCalls.push(options);
      return { __divIcon: true, ...options };
    }),
    latLngBounds: vi.fn((latlngs: unknown) => {
      state.latLngBoundsCalls.push(latlngs);
      return { __bounds: true, latlngs };
    }),
  },
}));

@Component({
  standalone: true,
  imports: [MapComponent],
  template: `
    <app-map
      [center]="center"
      [zoom]="zoom"
      [pin]="pin"
      [interactive]="interactive"
      [crosshair]="crosshair"
      [circleRadiusMeters]="circleRadiusMeters"
      [circleDashed]="circleDashed"
      [userPin]="userPin"
      [fitPins]="fitPins"
      [scrollGate]="scrollGate"
      [zoomInLabel]="zoomInLabel"
      [zoomOutLabel]="zoomOutLabel"
      [markers]="markers"
      [markerRadiusMeters]="markerRadiusMeters"
      [markerCircleMinZoom]="markerCircleMinZoom"
      [activeMarkerKey]="activeMarkerKey"
      [highlightedMarkerKey]="highlightedMarkerKey"
      [markerLabel]="markerLabel"
      [markerGroupLabel]="markerGroupLabel"
      (centerChange)="onCenterChange($event)"
      (mapError)="onMapError()"
      (markerHovered)="onMarkerHovered($event)"
      (markerActivated)="onMarkerActivated($event)"
      (viewportChanged)="onViewportChanged($event)"
      (mapClicked)="onMapClicked()"
    >
      <div app-map-gate-hint>Tap to move the map</div>
      <div app-map-scroll-hint>Hold Ctrl and scroll to zoom</div>
    </app-map>
  `,
})
class MapHostComponent {
  center: MapLatLng = { lat: 40.1776, lng: 44.5126 };
  zoom = 13;
  pin: MapLatLng | null = null;
  interactive = false;
  crosshair = false;
  circleRadiusMeters: number | null = null;
  circleDashed = false;
  userPin: MapLatLng | null = null;
  fitPins = false;
  scrollGate = false;
  zoomInLabel: string | null = null;
  zoomOutLabel: string | null = null;
  markers: MapMarkerGroup[] = [];
  markerRadiusMeters: number | null = null;
  markerCircleMinZoom = 12;
  activeMarkerKey: string | null = null;
  highlightedMarkerKey: string | null = null;
  markerLabel = 'Listing';
  markerGroupLabel = '{count} listings here';
  received: MapLatLng[] = [];
  errorCount = 0;
  hoveredAnchors: (MapMarkerAnchor | null)[] = [];
  activatedKeys: string[] = [];
  viewports: MapBounds[] = [];
  mapClickCount = 0;
  onCenterChange(c: MapLatLng): void {
    this.received.push(c);
  }
  onMapError(): void {
    this.errorCount++;
  }
  onMarkerHovered(anchor: MapMarkerAnchor | null): void {
    this.hoveredAnchors.push(anchor);
  }
  onMarkerActivated(key: string): void {
    this.activatedKeys.push(key);
  }
  onViewportChanged(bounds: MapBounds): void {
    this.viewports.push(bounds);
  }
  onMapClicked(): void {
    this.mapClickCount++;
  }
}

async function createHost() {
  TestBed.configureTestingModule({ imports: [MapHostComponent] });
  const fixture = TestBed.createComponent(MapHostComponent);
  fixture.detectChanges(); // triggers ngAfterViewInit -> the dynamic import('leaflet')
  await vi.runAllTimersAsync();
  fixture.detectChanges();
  return fixture;
}

describe('MapComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.mapOptions = null;
    state.tileLayerCalls = [];
    state.markerCalls = [];
    state.circleCalls = [];
    state.divIconCalls = [];
    state.latLngBoundsCalls = [];
    state.fitBoundsCalls = [];
    state.removedLayers = [];
    state.moveendHandlers = [];
    state.eventHandlers = {};
    state.fakeCenter = { lat: 40.1776, lng: 44.5126 };
    state.fakeZoom = 13;
    state.fakeContainerPoint = { x: 111, y: 222 };
    state.latLngToContainerPointCalls = [];
    state.fakeBounds = { getNorth: 40.2, getSouth: 40.1, getEast: 44.6, getWest: 44.5 };
    state.mapRemoved = false;
    state.mapThrows = false;
    state.lastInvalidateSize = null;
    state.pointerCoarse = false;
    state.prefersReducedMotion = false;
    state.lastDraggingEnable = null;
    state.lastTouchZoomEnable = null;
    state.lastZoomIn = null;
    state.lastZoomOut = null;
    resizeObserverInstances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Deliberately the first tests in the file: `resolveTileSource()`'s "warn
  // once" flag is module-level (see map.component.ts) and shared with every
  // other test below (which mounts the real component against the real,
  // checked-in `environment.ts` — apiKey always ''), so this must run first
  // to observe the warning transition from "not yet fired" to "fired".
  //
  // `resolveTileSource` is called directly (exported for exactly this) with
  // a fake provider config, rather than through the mounted component: the
  // Angular vitest builder in this repo rejects `vi.mock()` on relative
  // imports ("not supported for relative imports with the Angular unit-test
  // system"), so the `environment` module itself cannot be mocked to flip
  // between "no key" and "key configured" scenarios.
  it('resolveTileSource: warns once and falls back to OpenStreetMap tiles when no provider key is configured', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fakeProvider = {
      urlTemplate: 'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key={key}',
      apiKey: '',
      attribution: '<a href="https://www.maptiler.com/copyright/">&copy; MapTiler</a>',
      maxZoom: 20,
    };

    const first = resolveTileSource(fakeProvider);

    expect(first.url).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(first.attribution).toContain('OpenStreetMap contributors');
    expect(first.maxZoom).toBe(19);
    expect(first.isFallback).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('tileProvider.apiKey');

    // Calling again with the key still empty must not warn a second time.
    resolveTileSource(fakeProvider);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it('resolveTileSource: builds the configured provider URL from its template and key once a provider key is set', () => {
    const fakeProvider = {
      urlTemplate: 'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key={key}',
      apiKey: 'dummy-test-key',
      attribution: '<a href="https://www.maptiler.com/copyright/">&copy; MapTiler</a>',
      maxZoom: 20,
    };

    const result = resolveTileSource(fakeProvider);

    expect(result.url).toBe(
      'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=dummy-test-key',
    );
    expect(result.maxZoom).toBe(20);
    expect(result.attribution).toBe(fakeProvider.attribution);
    expect(result.isFallback).toBe(false);
  });

  // Regression for the patchy-tiles bug: Leaflet creates its pane/tile/control
  // DOM imperatively, outside Angular's template, so it never receives the
  // `_ngcontent-*`/`_nghost-*` attributes Angular's default `Emulated`
  // encapsulation stamps on template-created nodes and scopes this
  // component's compiled CSS (including the whole `leaflet.css` pulled in via
  // `@use`) to require. Under `Emulated`, every `leaflet.css` rule silently
  // failed to match a single real tile, so tiles kept the UA default
  // `position: static` instead of Leaflet's intended `absolute`, and rendered
  // stacked in document flow instead of positioned — see the class doc
  // comment for the full mechanism and how this was confirmed live. Asserting
  // on the rendered host/template elements (rather than reaching into
  // Angular's private `ɵcmp` metadata) keeps this test meaningful even if
  // Angular changes its internal encapsulation implementation.
  it('renders with encapsulation OFF so Leaflet-created DOM is reachable by leaflet.css selectors', async () => {
    const fixture = await createHost();

    const host: HTMLElement = fixture.nativeElement.querySelector('app-map');
    const child: HTMLElement = fixture.nativeElement.querySelector('.app-map__surface');
    const attrNames = (el: HTMLElement) => Array.from(el.attributes).map((a) => a.name);

    expect(attrNames(host).some((n) => n.startsWith('_nghost'))).toBe(false);
    expect(attrNames(child).some((n) => n.startsWith('_ngcontent'))).toBe(false);
  });

  // Regression for the "you are here" dot bug: map.component.scss used to
  // keep a `:host ::ng-deep` prefix on the Leaflet-owned marker rules
  // (`.app-map__marker*`, `.app-map__user-*`) left over from BEFORE this
  // component switched to `ViewEncapsulation.None`. That reads as harmless —
  // `::ng-deep` "escapes scoping" — but `::ng-deep` is not a real CSS
  // pseudo-element the browser understands; it only ever meant anything as a
  // textual marker Angular's Emulated-encapsulation shim rewrites at RUNTIME
  // (`shimStylesContent`), and that shim only runs when a component ID is
  // passed to it, which `NoneEncapsulationDomRenderer` never does (see the
  // class doc comment). So under `None` the compiled style string ships
  // completely verbatim: `:host ::ng-deep .app-map__user-dot { ... }` reaches
  // the browser as literal, invalid CSS, and the browser drops the ENTIRE
  // rule — not just the scoping prefix. Both the orange `pin` dot and the
  // blue `userPin` dot rendered with no size/background/halo as a result,
  // even though the divIcon element and its class name were present in the
  // DOM (which is exactly why the existing "renders a distinctly-styled
  // user-location marker" test below, asserting only `className`, passed the
  // whole time this was broken). Reading the compiled style strings directly
  // — rather than asserting computed style through jsdom, whose CSS engine
  // does not reliably resolve `color-mix()`/custom-property-heavy rules —
  // pins down the actual regression class without relying on jsdom fidelity.
  it('never emits `::ng-deep` in its compiled styles — invalid CSS once ViewEncapsulation.None ships them unshimmed', () => {
    const compiledStyles = (MapComponent as unknown as { ɵcmp: { styles: string[] } }).ɵcmp.styles;
    expect(compiledStyles.length).toBeGreaterThan(0);
    expect(compiledStyles.some((sheet) => sheet.includes('::ng-deep'))).toBe(false);
  });

  it('creates the map centred on the given coordinate and zoom, static (non-interactive) by default', async () => {
    await createHost();

    expect(state.mapOptions).not.toBeNull();
    expect(state.mapOptions!['center']).toEqual([40.1776, 44.5126]);
    expect(state.mapOptions!['zoom']).toBe(13);
    // Static mode: no pan/zoom/drag affordances.
    expect(state.mapOptions!['dragging']).toBe(false);
    expect(state.mapOptions!['zoomControl']).toBe(false);
    expect(state.mapOptions!['scrollWheelZoom']).toBe(false);
    // Attribution is mandatory (ODbL) regardless of interactivity.
    expect(state.mapOptions!['attributionControl']).toBe(true);
  });

  it('enables pan/zoom/drag when interactive=true', async () => {
    // Inputs are read once at map-creation time, so set interactive=true
    // BEFORE the first detectChanges() rather than mutating a live instance.
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.componentInstance.interactive = true;
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    expect(state.mapOptions!['dragging']).toBe(true);
    expect(state.mapOptions!['scrollWheelZoom']).toBe(true);
    expect(state.mapOptions!['touchZoom']).toBe(true);
  });

  // Regression: Leaflet's OWN zoom control must never be constructed, even
  // when interactive — every interactive map gets this component's own
  // `.app-map__zoom-stack` (below) instead. Was `true` when interactive
  // before that control existed; asserted separately from the test above so
  // a future revert of just this one option still fails clearly.
  it("never constructs Leaflet's own zoomControl, interactive or not", async () => {
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.componentInstance.interactive = true;
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    expect(state.mapOptions!['zoomControl']).toBe(false);
  });

  it('does NOT render the zoom stack when non-interactive (the default)', async () => {
    const fixture = await createHost(); // interactive=false by default
    expect(fixture.nativeElement.querySelector('.app-map__zoom-stack')).toBeNull();
  });

  // Separate `it()` from the non-interactive check above rather than two
  // fixtures in one test: each test gets its own fresh `TestBed`, reset
  // automatically between tests — reusing one test's `TestBed` for a SECOND
  // `configureTestingModule()` call throws ("test module has already been
  // instantiated") the moment the first fixture is created.
  it('renders a two-button zoom stack wired to Leaflet zoomIn()/zoomOut() when interactive', async () => {
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.componentInstance.interactive = true;
    fixture.detectChanges();
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.app-map__zoom-btn'),
    );
    expect(buttons).toHaveLength(2);

    buttons[0].click();
    buttons[1].click();

    expect(state.lastZoomIn).toHaveBeenCalledTimes(1);
    expect(state.lastZoomOut).toHaveBeenCalledTimes(1);
  });

  it('leaves the zoom buttons unlabelled when zoomInLabel/zoomOutLabel are not provided (the default)', async () => {
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.componentInstance.interactive = true;
    // zoomInLabel/zoomOutLabel left at MapHostComponent's default (`null`).
    fixture.detectChanges();
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    const [zoomInBtn, zoomOutBtn]: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.app-map__zoom-btn'),
    );
    expect(zoomInBtn.hasAttribute('aria-label')).toBe(false);
    expect(zoomOutBtn.hasAttribute('aria-label')).toBe(false);
  });

  // Labels are set BEFORE the first `detectChanges()` (never mutated on an
  // already-checked fixture and re-checked) — inputs are read once at
  // map-creation time, the same rule `interactive`/`scrollGate` follow
  // elsewhere in this file, and mutating a template-bound host field AFTER
  // a fixture has already been checked risks Angular's `checkNoChanges`
  // verification pass flagging it as a same-tick change (NG0100), not a
  // real production defect — see the class doc comment for `zoomInLabel`/
  // `zoomOutLabel` on why they exist as plain string inputs at all.
  it('applies the given aria-labels to the zoom buttons when provided', async () => {
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.componentInstance.interactive = true;
    fixture.componentInstance.zoomInLabel = 'Zoom in';
    fixture.componentInstance.zoomOutLabel = 'Zoom out';
    fixture.detectChanges();
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    const [zoomInBtn, zoomOutBtn]: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.app-map__zoom-btn'),
    );
    expect(zoomInBtn.getAttribute('aria-label')).toBe('Zoom in');
    expect(zoomOutBtn.getAttribute('aria-label')).toBe('Zoom out');
  });

  // Provides its own `TILE_PROVIDER_CONFIG` via `TestBed` instead of relying
  // on whatever happens to be in the checked-in `environment.ts` at test time
  // (its checked-in default is an empty key — see the field comment there) —
  // this is exactly the seam `TILE_PROVIDER_CONFIG` exists for. Covers both
  // the configured-provider URL construction AND the MapTiler logo
  // requirement in one scenario, since both are gated on the same
  // "a key is configured" fact (see `ResolvedTileSource.isFallback`'s doc
  // comment in map.component.ts).
  it('builds the configured provider tile URL and renders the MapTiler logo when a provider key is configured', async () => {
    const fakeConfig = {
      urlTemplate: 'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key={key}',
      apiKey: 'test-key-123',
      attribution: '<a href="https://www.maptiler.com/copyright/">&copy; MapTiler</a>',
      maxZoom: 20,
    };
    TestBed.configureTestingModule({
      imports: [MapHostComponent],
      providers: [{ provide: TILE_PROVIDER_CONFIG, useValue: fakeConfig }],
    });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.detectChanges();
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    expect(state.tileLayerCalls).toHaveLength(1);
    expect(state.tileLayerCalls[0].url).toBe(
      'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=test-key-123',
    );
    expect(state.tileLayerCalls[0].options['maxZoom']).toBe(20);
    expect(String(state.tileLayerCalls[0].options['attribution'])).toContain('MapTiler');

    const logo: HTMLAnchorElement | null =
      fixture.nativeElement.querySelector('.app-map__maptiler-logo');
    expect(logo).not.toBeNull();
    expect(logo!.getAttribute('href')).toBe('https://www.maptiler.com');
    expect(logo!.querySelector('svg')).not.toBeNull();
  });

  // Mirror of the test above with an empty key, also provided via `TestBed`,
  // so this is deterministic regardless of `environment.ts`. Does NOT
  // re-assert the console.warn call: `resolveTileSource()`'s "warn once" flag
  // is module-level (see map.component.ts) and was already flipped true by
  // the direct-call unit test at the top of this file (deliberately first,
  // for exactly this reason) — so mounting here fires no additional warning.
  // That test owns the warning assertion; this one owns the fallback URL +
  // hidden-logo wiring through the real component.
  it('falls back to the OpenStreetMap tile URL and hides the MapTiler logo when no provider key is configured', async () => {
    const fakeConfig = {
      urlTemplate: 'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key={key}',
      apiKey: '',
      attribution: '<a href="https://www.maptiler.com/copyright/">&copy; MapTiler</a>',
      maxZoom: 20,
    };
    TestBed.configureTestingModule({
      imports: [MapHostComponent],
      providers: [{ provide: TILE_PROVIDER_CONFIG, useValue: fakeConfig }],
    });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.detectChanges();
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    expect(state.tileLayerCalls).toHaveLength(1);
    expect(state.tileLayerCalls[0].url).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(String(state.tileLayerCalls[0].options['attribution'])).toContain(
      'OpenStreetMap contributors',
    );

    const logo = fixture.nativeElement.querySelector('.app-map__maptiler-logo');
    expect(logo).toBeNull();
  });

  it('renders a static marker when a pin is set and crosshair is off', async () => {
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.componentInstance.pin = { lat: 40.18, lng: 44.51 };
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    expect(state.markerCalls).toHaveLength(1);
    expect(state.markerCalls[0].coords).toEqual([40.18, 44.51]);
  });

  it('does NOT render the marker when crosshair mode is on, even with a pin set', async () => {
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.componentInstance.pin = { lat: 40.18, lng: 44.51 };
    fixture.componentInstance.crosshair = true;
    fixture.componentInstance.interactive = true;
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    expect(state.markerCalls).toHaveLength(0);
  });

  it('renders a distinctly-styled user-location marker when userPin is set, alongside the pin marker', async () => {
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.componentInstance.pin = { lat: 40.18, lng: 44.51 };
    fixture.componentInstance.userPin = { lat: 40.2, lng: 44.55 };
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    // Both markers exist — the pin (orange teardrop) and the user dot (blue).
    expect(state.markerCalls).toHaveLength(2);
    expect(state.markerCalls.map((m) => m.coords)).toEqual(
      expect.arrayContaining([
        [40.18, 44.51],
        [40.2, 44.55],
      ]),
    );
    // Distinct divIcon className — never the same marker style as `pin`.
    const classNames = state.divIconCalls.map((o) => o['className']);
    expect(classNames).toContain('app-map__marker');
    expect(classNames).toContain('app-map__user-marker');
  });

  it('does NOT render the user marker when crosshair mode is on, even with userPin set', async () => {
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.componentInstance.userPin = { lat: 40.2, lng: 44.55 };
    fixture.componentInstance.crosshair = true;
    fixture.componentInstance.interactive = true;
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    expect(state.markerCalls).toHaveLength(0);
  });

  it('does NOT call fitBounds when fitPins is off (the default), even with both pin and userPin set', async () => {
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.componentInstance.pin = { lat: 40.18, lng: 44.51 };
    fixture.componentInstance.userPin = { lat: 40.2, lng: 44.55 };
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    expect(state.fitBoundsCalls).toHaveLength(0);
  });

  it('frames both pin and userPin via fitBounds when fitPins is on', async () => {
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.componentInstance.interactive = true;
    fixture.componentInstance.pin = { lat: 40.18, lng: 44.51 };
    fixture.componentInstance.userPin = { lat: 40.2, lng: 44.55 };
    fixture.componentInstance.fitPins = true;
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    expect(state.latLngBoundsCalls).toHaveLength(1);
    expect(state.latLngBoundsCalls[0]).toEqual([
      [40.18, 44.51],
      [40.2, 44.55],
    ]);
    expect(state.fitBoundsCalls).toHaveLength(1);
    // A capped maxZoom (so two close-together points don't zoom to the
    // Leaflet max, which reads as "broken" rather than "precise") and some
    // padding — the exact numbers are this component's own internal choice,
    // not part of its public contract, so only their presence/shape is
    // pinned here.
    expect(typeof state.fitBoundsCalls[0].options['maxZoom']).toBe('number');
    expect(state.fitBoundsCalls[0].options['padding']).toBeDefined();
  });

  // Maps P2-2 loop hazard: `fitBounds()`'s own `moveend` must never reach a
  // caller as `viewportChanged`, or a viewport-driven refetch would follow
  // every auto-fit — fetch → fit → moveend → fetch … forever. See
  // `suppressNextMoveend`'s doc comment in map.component.ts.
  it('does NOT emit `viewportChanged` for the `moveend` its OWN `fitBounds()` call causes, but still does for a later real pan', async () => {
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.componentInstance.interactive = true;
    fixture.componentInstance.pin = { lat: 40.18, lng: 44.51 };
    fixture.componentInstance.userPin = { lat: 40.2, lng: 44.55 };
    fixture.componentInstance.fitPins = true;
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    // The mock's `fitBounds()` fires `moveend` synchronously (mirroring real
    // Leaflet's `animate: false` behaviour) — that must have been swallowed.
    expect(state.fitBoundsCalls).toHaveLength(1);
    expect(fixture.componentInstance.viewports).toHaveLength(0);

    // A genuine subsequent pan (the test harness invoking the registered
    // `moveend` handler directly, same as the pre-existing "emits the
    // visible viewport bounds on moveend" test) must still come through.
    state.moveendHandlers.forEach((h) => h());
    expect(fixture.componentInstance.viewports).toHaveLength(1);
  });

  it('does NOT call fitBounds when only one of pin/userPin is set, even with fitPins on', async () => {
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.componentInstance.pin = { lat: 40.18, lng: 44.51 };
    fixture.componentInstance.fitPins = true;
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    expect(state.fitBoundsCalls).toHaveLength(0);
  });

  it('does NOT call fitBounds in crosshair mode even with fitPins on and both points set', async () => {
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.componentInstance.pin = { lat: 40.18, lng: 44.51 };
    fixture.componentInstance.userPin = { lat: 40.2, lng: 44.55 };
    fixture.componentInstance.fitPins = true;
    fixture.componentInstance.crosshair = true;
    fixture.componentInstance.interactive = true;
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    expect(state.fitBoundsCalls).toHaveLength(0);
  });

  it('emits the current centre on moveend while crosshair mode is on, including an initial emit', async () => {
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.componentInstance.crosshair = true;
    fixture.componentInstance.interactive = true;
    fixture.detectChanges();
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    // The initial emit, before any user pan.
    expect(fixture.componentInstance.received).toEqual([{ lat: 40.1776, lng: 44.5126 }]);

    // Simulate the user panning the map.
    state.fakeCenter = { lat: 40.2, lng: 44.55 };
    state.moveendHandlers.forEach((h) => h());
    fixture.detectChanges();

    expect(fixture.componentInstance.received).toEqual([
      { lat: 40.1776, lng: 44.5126 },
      { lat: 40.2, lng: 44.55 },
    ]);
  });

  it('removes the map instance on destroy', async () => {
    const fixture = await createHost();
    fixture.destroy();
    expect(state.mapRemoved).toBe(true);
  });

  // Regression for the fixed-delay `setTimeout(invalidateSize, ...)` race this
  // replaced: a `ResizeObserver` re-measures on every REAL box-size change,
  // however long it takes to arrive, instead of gambling on 60ms/320ms ever
  // landing after the container reaches its final layout.
  it('observes the map container with a ResizeObserver and calls invalidateSize() on a reported resize', async () => {
    const fixture = await createHost();

    expect(resizeObserverInstances).toHaveLength(1);
    const observer = resizeObserverInstances[0];
    const containerEl: HTMLElement = fixture.nativeElement.querySelector('.app-map__surface');
    expect(observer.observed).toEqual([containerEl]);

    expect(state.lastInvalidateSize).not.toBeNull();
    expect(state.lastInvalidateSize).not.toHaveBeenCalled();

    observer.trigger();

    expect(state.lastInvalidateSize).toHaveBeenCalledTimes(1);
  });

  it('disconnects the ResizeObserver on destroy', async () => {
    const fixture = await createHost();
    const observer = resizeObserverInstances[0];

    fixture.destroy();

    expect(observer.disconnected).toBe(true);
  });

  it('draws no circle when circleRadiusMeters is left null (the default)', async () => {
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.componentInstance.pin = { lat: 40.18, lng: 44.51 };
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    expect(state.circleCalls).toHaveLength(0);
  });

  it('draws a translucent circle of the given radius centred on the pin', async () => {
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.componentInstance.pin = { lat: 40.18, lng: 44.51 };
    fixture.componentInstance.circleRadiusMeters = 600;
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    expect(state.circleCalls).toHaveLength(1);
    expect(state.circleCalls[0].coords).toEqual([40.18, 44.51]);
    expect(state.circleCalls[0].options['radius']).toBe(600);
    // Fill/stroke must actually resolve to a colour string (jsdom returns ''
    // for an undeclared custom property, so this also exercises the fallback).
    expect(state.circleCalls[0].options['fillColor']).toMatch(/^#[0-9a-f]{6}$/i);
    // Solid by default — no `dashArray` at all (not merely falsy), matching
    // pre-`circleDashed` behaviour exactly for every existing caller.
    expect(state.circleCalls[0].options['dashArray']).toBeUndefined();
  });

  it('draws the uncertainty circle dashed when circleDashed is set (radius-preview mode)', async () => {
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.componentInstance.pin = { lat: 40.18, lng: 44.51 };
    fixture.componentInstance.circleRadiusMeters = 600;
    fixture.componentInstance.circleDashed = true;
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    expect(state.circleCalls).toHaveLength(1);
    expect(state.circleCalls[0].options['dashArray']).toBe('6 6');
  });

  // Regression for the defect this replaced: the crosshair picker's radius
  // preview used to be a CSS-sized `div` (a fixed on-screen pixel diameter
  // computed once for the zoom the picker opened at) because this component
  // unconditionally suppressed its real geographic circle in `crosshair`
  // mode. That meant zooming the map left the preview the same PIXEL size
  // while the real search radius it was supposed to represent visually
  // shrank/grew underneath it — the two silently disagreed. The fix: draw a
  // real `L.Circle` (metres, not pixels) centred on the crosshair's current
  // position instead, so it now pans and re-scales with the map exactly like
  // the pin-anchored circle already did.
  describe('circleRadiusMeters in crosshair mode (no fixed pin to anchor to)', () => {
    it('draws no circle when circleRadiusMeters is left null (the default), same as pin mode', async () => {
      TestBed.configureTestingModule({ imports: [MapHostComponent] });
      const fixture = TestBed.createComponent(MapHostComponent);
      fixture.componentInstance.crosshair = true;
      fixture.componentInstance.interactive = true;
      fixture.detectChanges();
      await vi.runAllTimersAsync();

      expect(state.circleCalls).toHaveLength(0);
    });

    it("draws the circle centred on the MAP'S OWN CENTRE, never on `pin`, even when a pin happens to be set too", async () => {
      TestBed.configureTestingModule({ imports: [MapHostComponent] });
      const fixture = TestBed.createComponent(MapHostComponent);
      state.fakeCenter = { lat: 40.1776, lng: 44.5126 };
      fixture.componentInstance.pin = { lat: 40.18, lng: 44.51 };
      fixture.componentInstance.circleRadiusMeters = 600;
      fixture.componentInstance.crosshair = true;
      fixture.componentInstance.interactive = true;
      fixture.detectChanges();
      await vi.runAllTimersAsync();

      expect(state.circleCalls.length).toBeGreaterThan(0);
      const last = state.circleCalls[state.circleCalls.length - 1];
      expect(last.coords).toEqual([40.1776, 44.5126]);
      expect(last.options['radius']).toBe(600);
    });

    it('moves the circle to the new centre on every pan (moveend) — it must never stay at its opening position', async () => {
      TestBed.configureTestingModule({ imports: [MapHostComponent] });
      const fixture = TestBed.createComponent(MapHostComponent);
      state.fakeCenter = { lat: 40.1776, lng: 44.5126 };
      fixture.componentInstance.circleRadiusMeters = 600;
      fixture.componentInstance.crosshair = true;
      fixture.componentInstance.interactive = true;
      fixture.detectChanges();
      await vi.runAllTimersAsync();
      fixture.detectChanges();

      const initialCount = state.circleCalls.length;
      expect(initialCount).toBeGreaterThan(0);
      expect(state.circleCalls[initialCount - 1].coords).toEqual([40.1776, 44.5126]);

      // Simulate the user panning the map — same mechanism the "emits the
      // current centre on moveend" test above uses.
      state.fakeCenter = { lat: 40.2, lng: 44.55 };
      state.moveendHandlers.forEach((h) => h());
      fixture.detectChanges();

      const last = state.circleCalls[state.circleCalls.length - 1];
      expect(last.coords).toEqual([40.2, 44.55]);
      // Still the same radius — only the centre moved.
      expect(last.options['radius']).toBe(600);
    });

    it('supports the dashed radius-preview variant in crosshair mode too', async () => {
      TestBed.configureTestingModule({ imports: [MapHostComponent] });
      const fixture = TestBed.createComponent(MapHostComponent);
      fixture.componentInstance.circleRadiusMeters = 1000;
      fixture.componentInstance.circleDashed = true;
      fixture.componentInstance.crosshair = true;
      fixture.componentInstance.interactive = true;
      fixture.detectChanges();
      await vi.runAllTimersAsync();

      const last = state.circleCalls[state.circleCalls.length - 1];
      expect(last.options['dashArray']).toBe('6 6');
    });
  });

  it('emits mapError when the underlying Leaflet map construction throws', async () => {
    state.mapThrows = true;
    TestBed.configureTestingModule({ imports: [MapHostComponent] });
    const fixture = TestBed.createComponent(MapHostComponent);
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    expect(fixture.componentInstance.errorCount).toBe(1);
  });

  it('emits mapError when every tile in the batch errors and none ever loads (dead tile host)', async () => {
    // Real Leaflet fires GridLayer's `load` once the tile queue is empty
    // whether tiles succeeded or errored — so the fixture fires `tileerror`
    // for every tile, then `load` for the settled batch, same as the real
    // sequence a dead tile host produces.
    const fixture = await createHost();

    state.tileLayerCalls[0].handlers['tileerror']?.forEach((h) => h());
    expect(fixture.componentInstance.errorCount).toBe(0);

    state.tileLayerCalls[0].handlers['load']?.forEach((h) => h());

    expect(fixture.componentInstance.errorCount).toBe(1);
  });

  it('does NOT emit mapError when at least one tile loads before the batch settles', async () => {
    const fixture = await createHost();

    state.tileLayerCalls[0].handlers['tileerror']?.forEach((h) => h());
    state.tileLayerCalls[0].handlers['tileload']?.forEach((h) => h());
    state.tileLayerCalls[0].handlers['load']?.forEach((h) => h());

    expect(fixture.componentInstance.errorCount).toBe(0);
  });

  it('does NOT emit mapError when the tile batch settles with no errors at all', async () => {
    const fixture = await createHost();

    state.tileLayerCalls[0].handlers['tileload']?.forEach((h) => h());
    state.tileLayerCalls[0].handlers['load']?.forEach((h) => h());

    expect(fixture.componentInstance.errorCount).toBe(0);
  });

  describe('scrollGate — desktop (non-touch)', () => {
    // `state.pointerCoarse` stays `false` (the `beforeEach` default), so
    // `isTouchCapable` is `false` for every map created in this block —
    // exercising the desktop half of the gate, not the touch overlay.

    async function createGatedHost() {
      TestBed.configureTestingModule({ imports: [MapHostComponent] });
      const fixture = TestBed.createComponent(MapHostComponent);
      fixture.componentInstance.interactive = true;
      fixture.componentInstance.scrollGate = true;
      fixture.detectChanges();
      await vi.runAllTimersAsync();
      fixture.detectChanges();
      return fixture;
    }

    it('does not render the touch gate overlay on a non-touch pointer', async () => {
      const fixture = await createGatedHost();
      expect(fixture.nativeElement.querySelector('.app-map__gate')).toBeNull();
    });

    it('shows the scroll hint and does not let an un-modified wheel through when scrollGate is on', async () => {
      const fixture = await createGatedHost();
      const wrapper: HTMLElement = fixture.nativeElement.querySelector('.app-map');
      expect(fixture.nativeElement.querySelector('.app-map__scroll-hint')).toBeNull();

      wrapper.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true }));
      fixture.detectChanges();

      const hint: HTMLElement | null = fixture.nativeElement.querySelector('.app-map__scroll-hint');
      expect(hint).not.toBeNull();
      expect(hint!.textContent).toContain('Hold Ctrl and scroll to zoom');

      // Hides itself again after the debounce window.
      await vi.advanceTimersByTimeAsync(1100);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.app-map__scroll-hint')).toBeNull();
    });

    it('does NOT show the scroll hint for a Ctrl/⌘-held wheel — that is the zoom gesture', async () => {
      const fixture = await createGatedHost();
      const wrapper: HTMLElement = fixture.nativeElement.querySelector('.app-map');

      wrapper.dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true }),
      );
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.app-map__scroll-hint')).toBeNull();
    });

    it('does nothing when scrollGate is off (default) — no hint, wheel is left alone', async () => {
      TestBed.configureTestingModule({ imports: [MapHostComponent] });
      const fixture = TestBed.createComponent(MapHostComponent);
      fixture.componentInstance.interactive = true;
      // scrollGate left false (default).
      fixture.detectChanges();
      await vi.runAllTimersAsync();
      fixture.detectChanges();

      const wrapper: HTMLElement = fixture.nativeElement.querySelector('.app-map');
      wrapper.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true }));
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.app-map__scroll-hint')).toBeNull();
    });
  });

  describe('scrollGate — touch', () => {
    it('starts non-draggable behind a translucent gate overlay on a touch-primary pointer', async () => {
      state.pointerCoarse = true;
      TestBed.configureTestingModule({ imports: [MapHostComponent] });
      const fixture = TestBed.createComponent(MapHostComponent);
      fixture.componentInstance.interactive = true;
      fixture.componentInstance.scrollGate = true;
      fixture.detectChanges();
      await vi.runAllTimersAsync();
      fixture.detectChanges();

      expect(state.mapOptions!['dragging']).toBe(false);
      expect(state.mapOptions!['touchZoom']).toBe(false);
      const gate: HTMLElement | null = fixture.nativeElement.querySelector('.app-map__gate');
      expect(gate).not.toBeNull();
      expect(gate!.textContent).toContain('Tap to move the map');
      // No scroll-hint mechanics on a touch pointer.
      expect(fixture.nativeElement.querySelector('.app-map__scroll-hint')).toBeNull();
    });

    it('dismisses the gate on tap, enabling dragging/touchZoom on the live map', async () => {
      state.pointerCoarse = true;
      TestBed.configureTestingModule({ imports: [MapHostComponent] });
      const fixture = TestBed.createComponent(MapHostComponent);
      fixture.componentInstance.interactive = true;
      fixture.componentInstance.scrollGate = true;
      fixture.detectChanges();
      await vi.runAllTimersAsync();
      fixture.detectChanges();

      const gate: HTMLElement = fixture.nativeElement.querySelector('.app-map__gate');
      gate.click();
      fixture.detectChanges();

      expect(state.lastDraggingEnable).toHaveBeenCalledTimes(1);
      expect(state.lastTouchZoomEnable).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.querySelector('.app-map__gate')).toBeNull();
    });

    it('does not gate a touch pointer when scrollGate is off (default)', async () => {
      state.pointerCoarse = true;
      TestBed.configureTestingModule({ imports: [MapHostComponent] });
      const fixture = TestBed.createComponent(MapHostComponent);
      fixture.componentInstance.interactive = true;
      // scrollGate left false (default).
      fixture.detectChanges();
      await vi.runAllTimersAsync();
      fixture.detectChanges();

      expect(state.mapOptions!['dragging']).toBe(true);
      expect(fixture.nativeElement.querySelector('.app-map__gate')).toBeNull();
    });

    it('never gates the crosshair picker even with scrollGate on and a touch pointer', async () => {
      state.pointerCoarse = true;
      TestBed.configureTestingModule({ imports: [MapHostComponent] });
      const fixture = TestBed.createComponent(MapHostComponent);
      fixture.componentInstance.interactive = true;
      fixture.componentInstance.crosshair = true;
      fixture.componentInstance.scrollGate = true;
      fixture.detectChanges();
      await vi.runAllTimersAsync();
      fixture.detectChanges();

      expect(state.mapOptions!['dragging']).toBe(true);
      expect(fixture.nativeElement.querySelector('.app-map__gate')).toBeNull();
    });
  });

  // Maps P2-2 plumbing step: multi-marker API (`markers`, `markerRadiusMeters`,
  // `markerCircleMinZoom`, `activeMarkerKey`, `markerLabel`/`markerGroupLabel`)
  // and its three outputs (`markerHovered`, `markerActivated`,
  // `viewportChanged`).
  describe('markers (Maps P2-2 catalog pins)', () => {
    const groupA: MapMarkerGroup = {
      key: '40.180000,44.510000',
      position: { lat: 40.18, lng: 44.51 },
      count: 1,
    };
    const groupB: MapMarkerGroup = {
      key: '40.200000,44.550000',
      position: { lat: 40.2, lng: 44.55 },
      count: 1,
    };

    async function createMarkerHost() {
      TestBed.configureTestingModule({ imports: [MapHostComponent] });
      const fixture = TestBed.createComponent(MapHostComponent);
      fixture.componentInstance.markers = [groupA, groupB];
      fixture.detectChanges();
      await vi.runAllTimersAsync();
      fixture.detectChanges();
      return fixture;
    }

    /** Same as `createMarkerHost()` but also sets `markerRadiusMeters` (so
     *  the per-group circles actually render — the map's fake `getZoom()`
     *  defaults to 13, above `markerCircleMinZoom`'s own default of 12, so
     *  no `zoomend` needs firing) — used by the group-circle
     *  hover/click tests below, which need `MapHostComponent`'s own output
     *  collector arrays (`hoveredAnchors`/`activatedKeys`), unlike
     *  `createDirectMapFixture()` (mounts `MapComponent` directly, no
     *  wrapper to collect outputs into). */
    async function createMarkerHostWithCircles(markerRadiusMeters = 150) {
      TestBed.configureTestingModule({ imports: [MapHostComponent] });
      const fixture = TestBed.createComponent(MapHostComponent);
      fixture.componentInstance.markers = [groupA, groupB];
      fixture.componentInstance.markerRadiusMeters = markerRadiusMeters;
      fixture.detectChanges();
      await vi.runAllTimersAsync();
      fixture.detectChanges();
      return fixture;
    }

    /**
     * `MapComponent` mounted DIRECTLY (no `MapHostComponent` wrapper
     * template) via `TestBed.createComponent(MapComponent)` +
     * `fixture.componentRef.setInput(...)`, for tests that need to change an
     * input SIGNAL (`markers`, `userPin`, …) more than once over a test's
     * lifetime. `componentRef.setInput()` is the documented Angular testing
     * API for exactly that — unlike re-assigning a field on a WRAPPER host
     * component's template-bound property (`MapHostComponent`'s own
     * `[markers]="markers"`), it writes the input signal directly and
     * doesn't leave the wrapper's OWN already-checked template expression
     * value stale, which is what was tripping `NG0100:
     * ExpressionChangedAfterItHasBeenCheckedError` when this used
     * `fixture.componentInstance.markers = …` on `MapHostComponent` instead.
     */
    async function createDirectMapFixture(inputs: {
      markers?: MapMarkerGroup[];
      markerRadiusMeters?: number | null;
      markerCircleMinZoom?: number;
      markerGroupLabel?: string;
      userPin?: MapLatLng | null;
      fitPins?: boolean;
      interactive?: boolean;
      pin?: MapLatLng | null;
      showPin?: boolean;
      fitIncludesMarkers?: boolean;
      highlightedMarkerKey?: string | null;
    }) {
      TestBed.configureTestingModule({ imports: [MapComponent] });
      const fixture = TestBed.createComponent(MapComponent);
      fixture.componentRef.setInput('center', { lat: 40.1776, lng: 44.5126 });
      fixture.componentRef.setInput('interactive', inputs.interactive ?? false);
      if (inputs.markers !== undefined) fixture.componentRef.setInput('markers', inputs.markers);
      if (inputs.markerRadiusMeters !== undefined) {
        fixture.componentRef.setInput('markerRadiusMeters', inputs.markerRadiusMeters);
      }
      if (inputs.markerCircleMinZoom !== undefined) {
        fixture.componentRef.setInput('markerCircleMinZoom', inputs.markerCircleMinZoom);
      }
      if (inputs.markerGroupLabel !== undefined) {
        fixture.componentRef.setInput('markerGroupLabel', inputs.markerGroupLabel);
      }
      if (inputs.userPin !== undefined) fixture.componentRef.setInput('userPin', inputs.userPin);
      if (inputs.fitPins !== undefined) fixture.componentRef.setInput('fitPins', inputs.fitPins);
      if (inputs.pin !== undefined) fixture.componentRef.setInput('pin', inputs.pin);
      if (inputs.showPin !== undefined) fixture.componentRef.setInput('showPin', inputs.showPin);
      if (inputs.fitIncludesMarkers !== undefined) {
        fixture.componentRef.setInput('fitIncludesMarkers', inputs.fitIncludesMarkers);
      }
      if (inputs.highlightedMarkerKey !== undefined) {
        fixture.componentRef.setInput('highlightedMarkerKey', inputs.highlightedMarkerKey);
      }
      fixture.detectChanges();
      await vi.runAllTimersAsync();
      fixture.detectChanges();
      return fixture;
    }

    it('creates one marker per group and removes it when the group disappears from `markers`', async () => {
      const fixture = await createDirectMapFixture({ markers: [groupA, groupB] });
      expect(state.markerCalls).toHaveLength(2);

      fixture.componentRef.setInput('markers', [groupA]);
      fixture.detectChanges();
      await vi.runAllTimersAsync();

      // No NEW marker created for the group that's still there…
      expect(state.markerCalls).toHaveLength(2);
      // …and the removed group's marker was actually torn down.
      const removedMarkerObjects = state.removedLayers;
      expect(removedMarkerObjects.length).toBeGreaterThan(0);
    });

    it('does NOT recreate a marker whose key is unchanged between input changes, and updates its badge/aria-label in place when count changes', async () => {
      const fixture = await createDirectMapFixture({
        markers: [{ ...groupA, count: 1 }],
        markerGroupLabel: '{count} listings here',
      });

      expect(state.markerCalls).toHaveLength(1);
      const el = state.markerCalls[0].element!;
      expect(el.querySelector('.app-map__pin-badge')).toBeNull();

      // Same key, new array reference (realistic: parent recomputes on every
      // refetch), count bumped from 1 to 3. `componentRef.setInput()` — the
      // documented API for changing a signal input after the fact — rather
      // than re-assigning a WRAPPER host's template-bound field (see
      // `createDirectMapFixture`'s doc comment for why the latter tripped
      // NG0100 here).
      fixture.componentRef.setInput('markers', [{ ...groupA, count: 3 }]);
      fixture.detectChanges();
      await vi.runAllTimersAsync();

      // No new `L.marker()` call — the existing one was updated in place.
      expect(state.markerCalls).toHaveLength(1);
      const badge = el.querySelector('.app-map__pin-badge');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe('3');
      expect(el.getAttribute('aria-label')).toBe('3 listings here');
    });

    it("substitutes the `{count}` placeholder with EACH group's own count, so a group of 2 and a group of 5 do not announce identically", async () => {
      const fixture = await createDirectMapFixture({
        markers: [
          { ...groupA, count: 2 },
          { ...groupB, count: 5 },
        ],
        markerGroupLabel: '{count} listings here',
      });

      expect(state.markerCalls).toHaveLength(2);
      const [elA, elB] = state.markerCalls.map((call) => call.element!);
      expect(elA.getAttribute('aria-label')).toBe('2 listings here');
      expect(elB.getAttribute('aria-label')).toBe('5 listings here');
    });

    it('draws a translucent circle per group at `markerRadiusMeters`, and none below `markerCircleMinZoom`', async () => {
      TestBed.configureTestingModule({ imports: [MapHostComponent] });
      const fixture = TestBed.createComponent(MapHostComponent);
      fixture.componentInstance.markers = [groupA, groupB];
      fixture.componentInstance.markerRadiusMeters = 150;
      fixture.componentInstance.markerCircleMinZoom = 12;
      state.fakeZoom = 10; // below the threshold
      fixture.detectChanges();
      await vi.runAllTimersAsync();

      expect(state.circleCalls).toHaveLength(0);

      // Cross the threshold — mirrors a real Leaflet `zoomend` firing once
      // the zoom gesture settles.
      state.fakeZoom = 12;
      state.eventHandlers['zoomend']?.forEach((h) => h());
      fixture.detectChanges();

      expect(state.circleCalls).toHaveLength(2);
      expect(state.circleCalls.every((c) => c.options['radius'] === 150)).toBe(true);
    });

    // Defect fix: the group's radius circle is now the hover/click TARGET
    // itself (a much bigger, easier-to-hit affordance than the 24px ball
    // alone), not just decoration drawn under it — see
    // `syncMarkerGroupCircles()`'s doc comment in map.component.ts.
    describe('group circles are hoverable/clickable, same as the ball (defect fix)', () => {
      it('creates group circles as `interactive: true` with `bubblingMouseEvents: false`', async () => {
        await createDirectMapFixture({
          markers: [groupA, groupB],
          markerRadiusMeters: 150,
        });

        expect(state.circleCalls).toHaveLength(2);
        expect(state.circleCalls.every((c) => c.options['interactive'] === true)).toBe(true);
        // Leaflet's `Path` (which `Circle` extends) defaults
        // `bubblingMouseEvents` to `true` — UNLIKE `Marker`'s own `false`
        // default — so without explicitly turning it off here, a circle
        // click would ALSO bubble up and fire the map's own `click`
        // (`mapClicked`) right alongside `markerActivated`.
        expect(state.circleCalls.every((c) => c.options['bubblingMouseEvents'] === false)).toBe(
          true,
        );
      });

      it("a `mouseover` on a group circle emits `markerHovered` with that group's anchor and toggles `.is-animating` on its ball; `mouseout` emits `null`", async () => {
        const fixture = await createMarkerHostWithCircles();
        fixture.componentInstance.hoveredAnchors = [];
        const circleForA = state.circleCalls.find(
          (c) => c.coords[0] === groupA.position.lat && c.coords[1] === groupA.position.lng,
        )!;
        const ballElA = state.markerCalls[0].element!;

        circleForA.handlers['mouseover']?.forEach((h) => h());

        expect(fixture.componentInstance.hoveredAnchors.at(-1)).toEqual({
          key: groupA.key,
          x: state.fakeContainerPoint.x,
          y: state.fakeContainerPoint.y,
        });
        expect(ballElA.classList.contains('is-animating')).toBe(true);

        circleForA.handlers['mouseout']?.forEach((h) => h());

        expect(fixture.componentInstance.hoveredAnchors.at(-1)).toBeNull();
      });

      it("a `click` on a group circle emits `markerActivated` with the group key, and `markerHovered` with its anchor (the exact same `activateGroup()` behaviour the ball's own click uses)", async () => {
        const fixture = await createMarkerHostWithCircles();
        fixture.componentInstance.hoveredAnchors = [];
        const circleForB = state.circleCalls.find(
          (c) => c.coords[0] === groupB.position.lat && c.coords[1] === groupB.position.lng,
        )!;

        circleForB.handlers['click']?.forEach((h) => h());

        expect(fixture.componentInstance.activatedKeys).toEqual([groupB.key]);
        expect(fixture.componentInstance.hoveredAnchors.at(-1)).toEqual({
          key: groupB.key,
          x: state.fakeContainerPoint.x,
          y: state.fakeContainerPoint.y,
        });
      });

      // A circle's `mouseover`/`mouseout`/`click` handler looks the live
      // `MarkerEntry` up LAZILY (`markerGroupLayers.get(key)`) rather than
      // closing over it at circle-creation time — if the entry has since
      // been removed (group no longer in `markers`), the handler must be a
      // silent no-op, never a crash.
      it('does not throw when a group circle event fires for a key whose marker entry no longer exists', async () => {
        const fixture = await createDirectMapFixture({
          markers: [groupA, groupB],
          markerRadiusMeters: 150,
        });
        const circleForA = state.circleCalls.find(
          (c) => c.coords[0] === groupA.position.lat && c.coords[1] === groupA.position.lng,
        )!;

        fixture.componentRef.setInput('markers', [groupB]);
        fixture.detectChanges();
        await vi.runAllTimersAsync();

        expect(() => circleForA.handlers['mouseover']?.forEach((h) => h())).not.toThrow();
        expect(() => circleForA.handlers['mouseout']?.forEach((h) => h())).not.toThrow();
      });
    });

    it('emits the marker anchor on mouseover and `null` on mouseout', async () => {
      const fixture = await createMarkerHost();
      const el = state.markerCalls[0].element!;

      el.dispatchEvent(new MouseEvent('mouseover'));
      expect(fixture.componentInstance.hoveredAnchors.at(-1)).toEqual({
        key: groupA.key,
        x: state.fakeContainerPoint.x,
        y: state.fakeContainerPoint.y,
      });

      el.dispatchEvent(new MouseEvent('mouseout'));
      expect(fixture.componentInstance.hoveredAnchors.at(-1)).toBeNull();
    });

    it('emits `markerActivated` with the group key on click', async () => {
      const fixture = await createMarkerHost();
      const el = state.markerCalls[0].element!;

      el.dispatchEvent(new MouseEvent('click'));

      expect(fixture.componentInstance.activatedKeys).toEqual([groupA.key]);
    });

    it('emits `markerActivated` on Enter/Space while the marker holds keyboard focus', async () => {
      const fixture = await createMarkerHost();
      const el = state.markerCalls[1].element!;

      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));

      expect(fixture.componentInstance.activatedKeys).toEqual([groupB.key, groupB.key]);
    });

    // Touch/keyboard activation has no preceding real `mouseover` to supply
    // an anchor the way a desktop click always does — without this, a
    // caller has no pixel position to open a popup at until the visitor
    // happens to pan the map afterward. See `createMarkerEntry()`'s
    // `activate()` helper in map.component.ts.
    it("also emits the group's anchor via `markerHovered` on click, even with no preceding mouseover", async () => {
      const fixture = await createMarkerHost();
      const el = state.markerCalls[0].element!;
      fixture.componentInstance.hoveredAnchors = [];

      el.dispatchEvent(new MouseEvent('click'));

      expect(fixture.componentInstance.hoveredAnchors.at(-1)).toEqual({
        key: groupA.key,
        x: state.fakeContainerPoint.x,
        y: state.fakeContainerPoint.y,
      });
      expect(fixture.componentInstance.activatedKeys).toEqual([groupA.key]);
    });

    it("also emits the group's anchor via `markerHovered` on Enter/Space activation", async () => {
      const fixture = await createMarkerHost();
      const el = state.markerCalls[1].element!;
      fixture.componentInstance.hoveredAnchors = [];

      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(fixture.componentInstance.hoveredAnchors.at(-1)).toEqual({
        key: groupB.key,
        x: state.fakeContainerPoint.x,
        y: state.fakeContainerPoint.y,
      });
    });

    it("re-emits the tracked (hovered) marker anchor on `move`/`zoom` so a caller's popup stays glued during panning", async () => {
      const fixture = await createMarkerHost();
      const el = state.markerCalls[0].element!;
      el.dispatchEvent(new MouseEvent('mouseover'));
      fixture.componentInstance.hoveredAnchors = [];

      state.fakeContainerPoint = { x: 300, y: 400 };
      state.eventHandlers['move']?.forEach((h) => h());

      expect(fixture.componentInstance.hoveredAnchors.at(-1)).toEqual({
        key: groupA.key,
        x: 300,
        y: 400,
      });
    });

    it('emits `mapClicked` when the map background fires a real Leaflet `click`', async () => {
      const fixture = await createMarkerHost();

      state.eventHandlers['click']?.forEach((h) => h());

      expect(fixture.componentInstance.mapClickCount).toBe(1);
    });

    it('emits the visible viewport bounds on `moveend`', async () => {
      const fixture = await createMarkerHost();
      fixture.componentInstance.viewports = [];

      state.fakeBounds = { getNorth: 41, getSouth: 39, getEast: 45, getWest: 44 };
      state.moveendHandlers.forEach((h) => h());

      expect(fixture.componentInstance.viewports.at(-1)).toEqual({
        minLat: 39,
        maxLat: 41,
        minLng: 44,
        maxLng: 45,
      });
    });

    // M-024 regression, reproduced for the map's own hover-driven bounce
    // (mirrors the header ball's `DorentSymbolComponent` guard): under
    // `prefers-reduced-motion: reduce`, no CSS animation loop ever runs, so
    // `animationiteration` — the event the falling edge normally defers to —
    // never fires. `state.prefersReducedMotion` MUST be set before the
    // fixture is created (the flag is read once, at construction).
    it('clears `.is-animating` immediately on mouseout under prefers-reduced-motion, with no animationiteration event', async () => {
      state.prefersReducedMotion = true;
      const fixture = await createMarkerHost();
      const el = state.markerCalls[0].element!;

      el.dispatchEvent(new MouseEvent('mouseover'));
      expect(el.classList.contains('is-animating')).toBe(true);

      el.dispatchEvent(new MouseEvent('mouseout'));
      // No `animationiteration` dispatched at all — reduced motion means the
      // class must already be gone.
      expect(el.classList.contains('is-animating')).toBe(false);
    });

    it('defers clearing `.is-animating` to `animationiteration` when motion is NOT reduced (the default)', async () => {
      const fixture = await createMarkerHost();
      const el = state.markerCalls[0].element!;
      const ball = el.querySelector('.dr-symbol__ball')!;

      el.dispatchEvent(new MouseEvent('mouseover'));
      expect(el.classList.contains('is-animating')).toBe(true);

      el.dispatchEvent(new MouseEvent('mouseout'));
      // Still animating — the loop hasn't eased back to rest yet.
      expect(el.classList.contains('is-animating')).toBe(true);

      ball.dispatchEvent(new Event('animationiteration'));
      expect(el.classList.contains('is-animating')).toBe(false);
    });

    describe('highlightedMarkerKey (listing-detail "this is my toy" bounce)', () => {
      it('gives the highlighted group both `.is-active` (the ring) and `.is-animating` (the bounce) on mount', async () => {
        await createDirectMapFixture({
          markers: [groupA, groupB],
          highlightedMarkerKey: groupA.key,
        });

        const [elA, elB] = state.markerCalls.map((call) => call.element!);
        expect(elA.classList.contains('is-active')).toBe(true);
        expect(elA.classList.contains('is-animating')).toBe(true);
        expect(elB.classList.contains('is-active')).toBe(false);
        expect(elB.classList.contains('is-animating')).toBe(false);
      });

      it('does NOT stop animating when the pointer leaves a HIGHLIGHTED marker (hover ending must not override the permanent highlight)', async () => {
        await createDirectMapFixture({
          markers: [groupA, groupB],
          highlightedMarkerKey: groupA.key,
        });
        const elA = state.markerCalls[0].element!;
        expect(elA.classList.contains('is-animating')).toBe(true);

        // Hover the SAME (already-highlighted) marker, then leave it.
        elA.dispatchEvent(new MouseEvent('mouseover'));
        expect(elA.classList.contains('is-animating')).toBe(true);
        elA.dispatchEvent(new MouseEvent('mouseout'));

        // Still bouncing — it's the highlighted marker, hover ending is
        // irrelevant to it. No `animationiteration` needed either, since
        // `desiredAnimating` never actually went false.
        expect(elA.classList.contains('is-animating')).toBe(true);
      });

      it('gates the falling edge on `.is-animating` through the SAME animationiteration deferral as hover, when a group stops being highlighted', async () => {
        const fixture = await createDirectMapFixture({
          markers: [groupA, groupB],
          highlightedMarkerKey: groupA.key,
        });
        const elA = state.markerCalls[0].element!;
        const ballA = elA.querySelector('.dr-symbol__ball')!;
        expect(elA.classList.contains('is-animating')).toBe(true);

        fixture.componentRef.setInput('highlightedMarkerKey', null);
        fixture.detectChanges();
        await vi.runAllTimersAsync();

        // Still animating immediately after — the loop must ease back
        // through its own rest keyframe first (ADR-011/M-024), not snap.
        expect(elA.classList.contains('is-animating')).toBe(true);

        ballA.dispatchEvent(new Event('animationiteration'));
        expect(elA.classList.contains('is-animating')).toBe(false);
      });

      // M-024 regression, reproduced for the PERMANENT highlight instead of
      // hover: under `prefers-reduced-motion: reduce` no CSS animation loop
      // ever runs, so `animationiteration` never fires — the falling edge
      // must clear immediately or the ring's shadow sticks forever once a
      // group stops being highlighted.
      it('clears `.is-animating` immediately (no animationiteration) when a highlighted group is un-highlighted under prefers-reduced-motion', async () => {
        state.prefersReducedMotion = true;
        const fixture = await createDirectMapFixture({
          markers: [groupA, groupB],
          highlightedMarkerKey: groupA.key,
        });
        const elA = state.markerCalls[0].element!;
        expect(elA.classList.contains('is-animating')).toBe(true);

        fixture.componentRef.setInput('highlightedMarkerKey', null);
        fixture.detectChanges();
        await vi.runAllTimersAsync();

        expect(elA.classList.contains('is-animating')).toBe(false);
      });

      it('moves `.is-active`/`.is-animating` to a NEWLY highlighted group and clears them from the previous one', async () => {
        const fixture = await createDirectMapFixture({
          markers: [groupA, groupB],
          highlightedMarkerKey: groupA.key,
        });
        const [elA, elB] = state.markerCalls.map((call) => call.element!);

        fixture.componentRef.setInput('highlightedMarkerKey', groupB.key);
        fixture.detectChanges();
        await vi.runAllTimersAsync();

        expect(elB.classList.contains('is-active')).toBe(true);
        expect(elB.classList.contains('is-animating')).toBe(true);
        // groupA's `.is-active` clears immediately (that ring has no
        // animation-latch concern); `.is-animating` defers to
        // `animationiteration` under normal motion (asserted above already
        // for the single-group case) — here just confirm the ring moved.
        expect(elA.classList.contains('is-active')).toBe(false);
      });

      it('does NOT fight `activeMarkerKey` — a DIFFERENT group can be `.is-active` (popup open) while the highlighted group keeps its own ring independently', async () => {
        TestBed.configureTestingModule({ imports: [MapHostComponent] });
        const fixture = TestBed.createComponent(MapHostComponent);
        fixture.componentInstance.markers = [groupA, groupB];
        fixture.componentInstance.activeMarkerKey = groupB.key;
        fixture.componentInstance.highlightedMarkerKey = groupA.key;
        fixture.detectChanges();
        await vi.runAllTimersAsync();
        fixture.detectChanges();

        const [elA, elB] = state.markerCalls.map((call) => call.element!);
        // groupA: highlighted (ring + bounce). groupB: active/popup-open
        // (ring only, per `activeMarkerKey`'s own contract) — both `.is-active`
        // at once, on DIFFERENT markers, and only groupA bounces.
        expect(elA.classList.contains('is-active')).toBe(true);
        expect(elA.classList.contains('is-animating')).toBe(true);
        expect(elB.classList.contains('is-active')).toBe(true);
        expect(elB.classList.contains('is-animating')).toBe(false);
      });
    });

    describe('showPin (listing-detail: current listing is a marker group, not a second pin)', () => {
      it('does NOT create the plain `pin` marker when showPin is false, even with a pin coordinate set', async () => {
        await createDirectMapFixture({
          pin: { lat: 40.18, lng: 44.51 },
          showPin: false,
        });

        // No `.app-map__marker` divIcon (the plain-pin style) was requested.
        expect(state.divIconCalls.some((o) => o['className'] === 'app-map__marker')).toBe(false);
      });

      it('still anchors `syncCircle()` (the uncertainty circle) and `syncFitBounds()` at `pin` when showPin is false', async () => {
        await createDirectMapFixture({
          interactive: true,
          pin: { lat: 40.18, lng: 44.51 },
          showPin: false,
          userPin: { lat: 40.2, lng: 44.55 },
          fitPins: true,
        });

        // `pin` still participates as one of the two fitBounds points.
        expect(state.latLngBoundsCalls).toHaveLength(1);
        expect(state.latLngBoundsCalls[0]).toEqual(
          expect.arrayContaining([[40.18, 44.51]]),
        );
      });

      it('renders the plain `pin` marker when showPin is left at its default (true) — existing callers unchanged', async () => {
        await createDirectMapFixture({ pin: { lat: 40.18, lng: 44.51 } });

        expect(state.markerCalls.some((m) => m.coords[0] === 40.18 && m.coords[1] === 44.51)).toBe(
          true,
        );
      });
    });

    describe('fitIncludesMarkers (listing-detail: "frame me and the toy", never the whole catalogue)', () => {
      it('excludes marker-group positions from the fitBounds frame when false, even with fitPins on and markers present', async () => {
        await createDirectMapFixture({
          interactive: true,
          pin: { lat: 40.18, lng: 44.51 },
          showPin: false,
          userPin: { lat: 40.2, lng: 44.55 },
          fitPins: true,
          fitIncludesMarkers: false,
          markers: [groupA, groupB],
        });

        // Only the two explicit points (pin + userPin) — neither groupA's
        // nor groupB's position is in the bounds.
        expect(state.latLngBoundsCalls).toHaveLength(1);
        expect(state.latLngBoundsCalls[0]).toEqual([
          [40.18, 44.51],
          [40.2, 44.55],
        ]);
      });

      it('includes marker-group positions by default (fitIncludesMarkers=true) — catalogue map unchanged', async () => {
        await createDirectMapFixture({
          interactive: true,
          fitPins: true,
          userPin: { lat: 40.2, lng: 44.55 },
          markers: [groupA],
        });

        expect(state.latLngBoundsCalls).toHaveLength(1);
        expect(state.latLngBoundsCalls[0]).toEqual(
          expect.arrayContaining([[40.18, 44.51]]),
        );
      });
    });

    it('includes marker group positions in the fitBounds frame alongside pin/userPin', async () => {
      const fixture = await createDirectMapFixture({
        interactive: true,
        fitPins: true,
        markers: [groupA],
      });

      // A single point alone is never "fit" — matches the pre-existing
      // pin+userPin behaviour, which already required at least two points.
      expect(state.latLngBoundsCalls).toHaveLength(0);
      expect(state.fitBoundsCalls).toHaveLength(0);

      // Adding `userPin` brings the total to two points (userPin + the one
      // marker group) — now it fits, and the marker group's position is
      // part of the bounds `L.latLngBounds()` was called with.
      fixture.componentRef.setInput('userPin', { lat: 40.2, lng: 44.55 });
      fixture.detectChanges();
      await vi.runAllTimersAsync();

      expect(state.latLngBoundsCalls).toHaveLength(1);
      expect(state.latLngBoundsCalls[0]).toEqual([
        [40.2, 44.55],
        [40.18, 44.51],
      ]);
      expect(state.fitBoundsCalls).toHaveLength(1);
    });

    it('projects `[app-map-overlay]` content above the map, stacked below the zoom stack', async () => {
      const fixture = await createMarkerHost();
      const overlay: HTMLElement | null = fixture.nativeElement.querySelector('.app-map__overlay');
      expect(overlay).not.toBeNull();
    });
  });
});
