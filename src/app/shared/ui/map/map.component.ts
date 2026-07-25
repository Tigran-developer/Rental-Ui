import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  InjectionToken,
  OnDestroy,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type * as Leaflet from 'leaflet';

import { environment } from '../../../../environments/environment';

/**
 * A latitude/longitude pair. The only "coordinate" shape this component's
 * public API speaks — callers never see a Leaflet type.
 */
export interface MapLatLng {
  lat: number;
  lng: number;
}

/**
 * `leaflet` ships as a CommonJS/UMD bundle, not native ESM. Depending on which
 * bundler is processing the dynamic `import('leaflet')` below, the resulting
 * module namespace shape differs:
 *  - Angular's dev server (`ng serve`, Vite-based) flattens the CJS exports
 *    onto the namespace object itself, so `mod.map` is already the function.
 *  - A production build (`ng build`, esbuild-based) does NOT flatten them for
 *    this dynamic import — it exposes only `mod.default` (the whole Leaflet
 *    namespace object), leaving `mod.map` `undefined`.
 * Calling `L.map(...)` when only `.default` is populated throws "L.map is not
 * a function", which the try/catch in `init()` swallows and reports as
 * `mapError` — i.e. every production build failed to render any map at all
 * (tiles, attribution, everything) while `ng serve` looked fine, which is
 * exactly what made this look environment-specific. Reading whichever of the
 * two shapes actually carries the named exports makes this robust to either
 * bundler's interop behaviour instead of depending on one of them.
 */
function resolveLeafletModule(mod: typeof Leaflet): typeof Leaflet {
  // `'map' in mod` (rather than reading `mod.map` directly) matters here:
  // under Vitest's mocked-module namespace, reading a property the mock
  // factory never returned throws a diagnostic error instead of yielding
  // `undefined`, which `in` doesn't trigger.
  if ('map' in mod) return mod;
  const withDefault = mod as unknown as { default?: typeof Leaflet };
  return withDefault.default ?? mod;
}

interface ResolvedTileSource {
  url: string;
  attribution: string;
  maxZoom: number;
  /**
   * `true` when no provider key was configured and this resolved to the
   * unauthenticated OSM fallback rather than the configured provider. Drives
   * `MapComponent.showMapTilerLogo` below: MapTiler's free-plan terms require
   * a visible logo linking to maptiler.com whenever ITS tiles are shown
   * (https://docs.maptiler.com/guides/map-design/how-to-add-maptiler-attribution-to-a-map/)
   * — showing that logo while actually serving generic OSM fallback tiles
   * would misattribute the fallback, so the logo is gated on "using the
   * configured provider" rather than always on. This assumes the configured
   * provider IS MapTiler (true for every environment file today); if the
   * provider is ever swapped for a non-MapTiler one, this flag and the logo
   * markup in map.component.html need revisiting together.
   */
  isFallback: boolean;
}

/**
 * Widened shape of `environment.tileProvider` (whose own type is a `readonly`
 * string-literal type via `as const`). `resolveTileSource()` takes this
 * instead of `typeof environment.tileProvider` so `map.component.spec.ts` can
 * pass a fake config of plain `string`/`number` fields — see the export's
 * doc comment for why the spec needs to call this directly at all.
 */
interface TileProviderConfig {
  urlTemplate: string;
  apiKey: string;
  attribution: string;
  maxZoom: number;
}

/**
 * DI seam for `TileProviderConfig`. `MapComponent` (below) injects this
 * instead of importing `environment` directly, so which config it renders
 * with is a matter of what got provided, not a fact baked into a checked-in
 * file. Defaults (`providedIn: 'root'`) to the real `environment.tileProvider`
 * so every consumer that never overrides it keeps working unchanged: the app
 * itself (explicitly re-provided in `app.config.ts` for discoverability,
 * mirroring how e.g. `DEFAULT_CURRENCY_CODE` is registered there) and every
 * other spec that mounts `app-map` without caring about tile config at all
 * (`location-picker.component.spec.ts`, `listing-location.component.spec.ts`,
 * `create-listing-form.component.spec.ts`). `map.component.spec.ts` overrides
 * it per-test via `TestBed`'s `providers` array to pin down the
 * "key configured" vs "no key" scenarios deterministically, regardless of
 * whatever happens to be in `environment.ts` at test time.
 */
export const TILE_PROVIDER_CONFIG = new InjectionToken<TileProviderConfig>(
  'TILE_PROVIDER_CONFIG',
  {
    providedIn: 'root',
    factory: () => environment.tileProvider,
  },
);

// Used only when `environment.tileProvider.apiKey` is empty (no vendor
// account configured yet) — never delete this without also removing the
// fallback branch in `resolveTileSource()` below.
const OSM_FALLBACK_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_FALLBACK_ATTRIBUTION = '&copy; OpenStreetMap contributors';
const OSM_FALLBACK_MAX_ZOOM = 19;

// Logged at most once per page load (module-level, not per-instance) — a
// missing key is a one-time setup fact, not something worth repeating every
// time a map mounts.
let didWarnMissingTileKey = false;

/**
 * Builds the tile URL/attribution/maxZoom this component's `L.tileLayer`
 * gets constructed with. This is the ONLY function that reads
 * `environment.tileProvider` or knows the OSM fallback exists — callers of
 * `app-map` never see a tile URL.
 *
 * With `tileProvider.apiKey` set, uses the configured provider (MapTiler by
 * default) verbatim. With it empty — e.g. no account created yet — falls
 * back to the unauthenticated `tile.openstreetmap.org` endpoint so the app
 * never ships a blank map for a missing key, and logs one console warning
 * naming the config field to set.
 *
 * `provider` defaults to the real `environment.tileProvider` — this is also
 * the `TILE_PROVIDER_CONFIG` token's own default (see above), so callers that
 * go through the token get the same fallback. `MapComponent` below always
 * passes its injected config explicitly rather than relying on this default.
 * `map.component.spec.ts` calls this exported function directly with a fake
 * config for its two `resolveTileSource()`-level unit tests (URL
 * construction, fallback, warn-once) instead of mounting the component; its
 * component-level tests instead override `TILE_PROVIDER_CONFIG` via `TestBed`.
 */
export function resolveTileSource(
  provider: TileProviderConfig = environment.tileProvider,
): ResolvedTileSource {
  if (!provider.apiKey) {
    if (!didWarnMissingTileKey) {
      didWarnMissingTileKey = true;
      console.warn(
        '[app-map] tileProvider.apiKey is empty (src/environments/environment.ts) — ' +
          'falling back to tile.openstreetmap.org. Set tileProvider.apiKey to a MapTiler ' +
          'key (see Rental-Ui/CLAUDE.md) to switch to the configured provider.',
      );
    }
    return {
      url: OSM_FALLBACK_URL,
      attribution: OSM_FALLBACK_ATTRIBUTION,
      maxZoom: OSM_FALLBACK_MAX_ZOOM,
      isFallback: true,
    };
  }
  return {
    url: provider.urlTemplate.replace('{key}', provider.apiKey),
    attribution: provider.attribution,
    maxZoom: provider.maxZoom,
    isFallback: false,
  };
}

/**
 * Shared Leaflet map wrapper — the ONLY file in the codebase allowed to import
 * `leaflet`. Everything else (the wizard's location picker today; the P1-8
 * read-only listing-detail map next) talks to this through inputs/outputs only,
 * so Leaflet types never leak across the boundary.
 *
 * Leaflet itself is loaded with a dynamic `import('leaflet')` inside
 * `ngAfterViewInit` (see `resolveLeafletModule()` above for the CJS-interop
 * gotcha that hides behind that import), and its CSS is bundled into this
 * component's own stylesheet (`@use 'leaflet/dist/leaflet.css'` in
 * `map.component.scss`) rather than shipped as a separately-served asset — so
 * neither adds to the app's main bundle, but both always travel with whatever
 * chunk this component lives in.
 *
 * `encapsulation: ViewEncapsulation.None` is load-bearing, not a style choice:
 * Leaflet creates its own pane/tile/control DOM imperatively (`document.
 * createElement`, inside the container this component owns) — those elements
 * are never part of Angular's template, so under the default `Emulated`
 * encapsulation they never receive the `_ngcontent-*` attribute Angular
 * stamps onto template-created nodes. Angular's build scopes EVERY selector
 * in this component's compiled stylesheet with that attribute, including
 * `leaflet.css`'s own rules pulled in via `@use` — so with `Emulated` on,
 * `.leaflet-tile { position: absolute; ... }` compiles to a selector that can
 * never match a real tile `<img>`, and the whole rule silently no-ops. Every
 * tile then falls back to the UA default for `<img>` (`position: static;
 * display: inline`), so tiles Leaflet positions via inline
 * `transform: translate3d(...)` (assuming absolute positioning) instead stack
 * in NORMAL DOCUMENT FLOW one below the other — the tile pane balloons to
 * many tiles' combined height, and `.app-map`'s `overflow: hidden` clips it
 * back down to the visible box, leaving only whatever fragments of that
 * flow-stacked column happen to fall inside — a "some tiles show, checkerboard
 * grey gaps elsewhere" pattern that looks like a partial-load race but isn't:
 * confirmed live (`ViewEncapsulation.Emulated` vs `.None`, everything else
 * identical) by reading each tile's *computed* `position` — `static` under
 * `Emulated`, `absolute` under `None` — while its *inline* `transform` never
 * changed. This is why the marker/crosshair rules below use `:host ::ng-deep`
 * (which escapes emulated scoping for those specific selectors): that was the
 * right fix for the few custom classes this component authors itself, but
 * `leaflet.css` is a whole third-party stylesheet of plain selectors with no
 * `::ng-deep`, so only turning off encapsulation for the component covers it.
 * `:host`/`::ng-deep` continue to work with `None` (the former still resolves
 * to this component's host selector; the latter is simply a no-op since
 * nothing is scoped) — see `map.component.spec.ts` for the regression
 * assertion pinning this metadata.
 *
 * Two display modes:
 * - `interactive=false` (default): a frozen thumbnail — no pan/zoom/drag. Used
 *   for the small "here's your pin" preview and (P1-8) the detail-page map.
 * - `interactive=true`: fully pannable/zoomable.
 *   - with `pin` set: shows a static marker at that coordinate.
 *   - with `crosshair=true`: hides the marker and instead overlays a fixed
 *     crosshair pin at the container's centre — the MAP pans under it. This is
 *     the full-screen location-picker's mechanism (dragging a marker is much
 *     less reliable on touch). `centerChange` emits the map's centre whenever
 *     it settles.
 *
 * `circleRadiusMeters` (P1-8): when set alongside `pin` (and `crosshair` is
 * off), draws a translucent circle of that radius centred on the pin — used by
 * the detail-page map to show the honest uncertainty radius of a fuzzed
 * (geohash-6-snapped) coordinate. Its stroke/fill colour is read from the
 * `--ui-color-primary` CSS custom property on this component's own host at
 * draw time (falling back to the design token's literal value if that ever
 * fails) rather than hardcoded, so it is impossible for Leaflet's SVG renderer
 * — which resolves colour strings once, on the DOM it owns outside Angular's
 * style encapsulation — to drift from the app's actual token.
 *
 * The tile provider's attribution control is always shown, even in static
 * mode — that's a licence requirement of whichever tile source is active
 * (ODbL for the OSM fallback; MapTiler's own terms for the default
 * provider), not decoration, so it is never disabled. The tile URL template,
 * attribution string, `maxZoom` and API key are configuration, injected via
 * `TILE_PROVIDER_CONFIG` (defaulting to `environment.tileProvider` — see that
 * token's doc comment above), not constants here — see `resolveTileSource()`
 * above for the fallback this component applies when no key is configured
 * yet.
 *
 * MapTiler's free-plan terms additionally require a visible logo linking to
 * maptiler.com (the attribution text control above is necessary but not
 * sufficient) — see
 * https://docs.maptiler.com/guides/map-design/how-to-add-maptiler-attribution-to-a-map/.
 * Rendered as inline SVG (`.app-map__maptiler-logo` in the template, the
 * exact asset MapTiler serves at `api.maptiler.com/resources/logo.svg`,
 * committed here rather than fetched at runtime), bottom-left so it never
 * collides with Leaflet's own attribution control (bottom-right), this
 * component's own zoom stack (top-right, see below), or with the
 * crosshair/pin/circle this component draws at centre. Gated by
 * `showMapTilerLogo` on `!tileSource.isFallback` — it must NOT show while
 * actually serving the OSM fallback (see `ResolvedTileSource.isFallback`'s
 * doc comment).
 *
 * `mapError` fires once if the map fails to come up at all: the dynamic
 * `import('leaflet')` rejects, `L.map()`/tile-layer setup throws, or every
 * tile in the initial viewport fails (dead tile host / offline) — see the
 * `tileload`/`tileerror`/`load` wiring in `init()`. Note `GridLayer`'s own
 * `load` event fires once the tile-loading queue is empty, i.e. once every
 * requested tile has *settled* — NOT once every tile has *succeeded*; it
 * fires the same way whether tiles loaded or errored. So "the map failed" is
 * decided by combining it with per-tile `tileload`/`tileerror` counts (at
 * least one error, and not a single success) rather than trusting `load`
 * alone. Callers must treat `mapError` as "no map" and fall back to a
 * text-only display — this component never renders an empty grey box on
 * failure, but it also doesn't retry on its own.
 *
 * `userPin` (Maps P2, "location + radius" design): a second marker, styled as
 * a pulsing blue dot (`.app-map__user-marker`, colour token
 * `--ui-color-map-user`) rather than the orange teardrop `pin` uses — the
 * two must never be visually confused, since a caller showing both at once
 * (the listing detail map's "My location" toggle) is exactly the point.
 * Unlike the `pin`/`circle` colour (drawn by Leaflet's SVG renderer, which
 * needs a resolved colour *string* read off the DOM — see `readPrimaryColor()`
 * below), the user dot is a `divIcon` (plain HTML Leaflet drops into its
 * marker pane), so it can reference the CSS custom property directly in
 * `map.component.scss` with no JS colour-reading step. Suppressed in
 * `crosshair` mode for the same reason `pin`/`circle` are: the crosshair
 * overlay has no fixed coordinate to anchor a second marker to either.
 *
 * `fitPins`: when both `pin` and `userPin` are set (and `crosshair` is off),
 * frames both in view via Leaflet's `fitBounds()` instead of the plain
 * `center`/`zoom` the map was constructed with. This deliberately does NOT
 * write back into the `center` input — see `LocationPickerComponent`'s own
 * doc comment (and the P1 feature note, NG0103) for why a live map position
 * must never round-trip back into a `[center]` binding: that closes a
 * pan → emit → input-change → `setView()` → pan-again loop. `fitBounds()`
 * here is a one-shot imperative call on the live `Leaflet.Map`, triggered by
 * an `effect()` that watches the `pin`/`userPin` *input* signals — never by
 * anything the map itself emits — so it cannot re-trigger its own effect.
 * `FIT_BOUNDS_MAX_ZOOM` caps how far it will zoom in when the two points are
 * close together (a few metres apart would otherwise fit to the map's max
 * zoom, which reads as "broken", not "precise").
 *
 * `circleDashed`: a purely visual variant of the existing `circleRadiusMeters`
 * circle (solid stroke by default) — the full-screen reference-point picker
 * (Maps P2 design, screen 5) uses a dashed stroke for its live radius
 * *preview*, to read as provisional/uncommitted next to the solid circle the
 * detail page draws for an already-published listing.
 *
 * Zoom controls are this component's OWN `.app-map__zoom-stack` (top-right,
 * `+`/`−`), not Leaflet's built-in `zoomControl` — the latter is always
 * constructed disabled (`zoomControl: false`) regardless of `interactive`, so
 * every interactive map in the app (this changes the full-screen location
 * picker's on-screen control too, not just new callers) gets the same
 * design-system button instead of Leaflet's default OS-chrome-styled pair.
 * `zoomInLabel`/`zoomOutLabel` are plain string inputs (not a translate pipe
 * import here — this file must stay ignorant of ngx-translate the same way it
 * stays ignorant of ngx-translate keys for the gate/hint copy below) so a
 * caller can supply a translated `aria-label`; omitted, the buttons simply
 * have no accessible name beyond their icon, which callers should avoid.
 * `[app-map-actions]` is a projection slot (bottom-right, clear of Leaflet's
 * attribution control) for whatever OTHER buttons a caller wants docked to
 * the map — "expand to full-screen", "my location" — without this component
 * having to know what those buttons do; callers needing the same visual
 * treatment can apply this component's own (unscoped — see
 * `ViewEncapsulation.None` above) `.app-map__btn` class to their projected
 * button.
 *
 * `scrollGate` (Maps P2 design, decision #2): opts an `interactive` map (never
 * `crosshair` — a full-screen picker has no surrounding page to protect) into
 * NOT stealing the page's scroll/touch gesture by default:
 * - **Desktop:** a plain wheel over the map still scrolls the PAGE; only
 *   Ctrl/⌘+wheel zooms the map. Implemented by intercepting `wheel` during
 *   the CAPTURE phase on `.app-map` (an ANCESTOR of the Leaflet-owned
 *   container `.app-map__surface`, which is where Leaflet's own
 *   `scrollWheelZoom` handler listens) and calling `stopPropagation()`
 *   whenever no modifier is held — capture-phase `stopPropagation()` on an
 *   ancestor halts the event before it ever reaches the descendant, so this
 *   works regardless of whether Leaflet's own listener happened to attach
 *   before or after this one (same-element listener order is NOT decided by
 *   the `capture` flag, only ancestor-vs-descendant order is — which is why
 *   this listens on the wrapper `div`, not the surface Leaflet owns).
 *   Leaflet's `scrollWheelZoom` stays enabled the whole time; it simply never
 *   sees the un-modified event. A held modifier is a no-op here, so the event
 *   continues to Leaflet exactly as if this listener didn't exist.
 *   `showScrollHint` (`.app-map__scroll-hint`, content via the
 *   `[app-map-scroll-hint]` slot) flashes for ~1.1s on an intercepted wheel,
 *   telling the visitor how to actually zoom.
 * - **Touch:** the map starts with `dragging`/`touchZoom` both disabled and a
 *   translucent `.app-map__gate` overlay (content via `[app-map-gate-hint]`)
 *   covers the whole map; tapping it calls `dragging.enable()` +
 *   `touchZoom.enable()` on the live map and hides itself for the rest of
 *   this component's lifetime. "Touch" is decided once, at construction, from
 *   `matchMedia('(pointer: coarse)')` — the PRIMARY input's capability, not
 *   viewport width, so a touchscreen laptop with a trackpad (`pointer: fine`
 *   primary) correctly gets the desktop Ctrl-gate behaviour instead.
 * Both the scroll-hint and gate overlays are deliberately TRANSLUCENT
 * (`color-mix()` over `--ui-color-secondary`, matching the approved design),
 * not opaque — the MapTiler logo and attribution control stay visible
 * (dimmed) underneath rather than being hidden, which the licence requires
 * regardless of interaction state.
 */
@Component({
  selector: 'app-map',
  standalone: true,
  imports: [],
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // See the class doc comment above — load-bearing, not a style preference.
  encapsulation: ViewEncapsulation.None,
})
export class MapComponent implements AfterViewInit, OnDestroy {
  private readonly containerRef =
    viewChild.required<ElementRef<HTMLDivElement>>('container');
  // The `.app-map` wrapper — an ANCESTOR of `containerRef` (Leaflet's own
  // container). The scroll-gate wheel listener attaches here rather than on
  // `containerRef` — see the class doc comment's "Desktop" bullet for why
  // ancestor-capture, not same-element-capture, is what makes listener order
  // deterministic against Leaflet's own `scrollWheelZoom` handler.
  private readonly wrapperRef = viewChild.required<ElementRef<HTMLDivElement>>('wrapper');

  readonly center = input.required<MapLatLng>();
  readonly zoom = input<number>(13);
  readonly pin = input<MapLatLng | null>(null);
  readonly height = input<string>('280px');
  readonly interactive = input<boolean>(false);
  readonly crosshair = input<boolean>(false);
  /** Radius (metres) of the translucent uncertainty circle drawn at `pin`. `null` (default) draws no circle. */
  readonly circleRadiusMeters = input<number | null>(null);
  /** Dashed stroke instead of solid for the `circleRadiusMeters` circle — see the class doc comment. */
  readonly circleDashed = input<boolean>(false);
  /** A second, blue pulsing marker (the visitor's own location) — see the class doc comment. */
  readonly userPin = input<MapLatLng | null>(null);
  /** When both `pin` and `userPin` are set, frame both via `fitBounds()` instead of `center`/`zoom`. */
  readonly fitPins = input<boolean>(false);
  /** Opts an `interactive` (non-`crosshair`) map into the scroll/touch capture gate — see the class doc comment. */
  readonly scrollGate = input<boolean>(false);
  /** Translated `aria-label` for the `+` zoom button. `null` (default) leaves it unlabelled. */
  readonly zoomInLabel = input<string | null>(null);
  /** Translated `aria-label` for the `−` zoom button. `null` (default) leaves it unlabelled. */
  readonly zoomOutLabel = input<string | null>(null);

  readonly centerChange = output<MapLatLng>();
  readonly mapError = output<void>();

  // Resolved once per instance (config is static for the app's lifetime) so
  // `init()` and `showMapTilerLogo` below read the exact same result instead
  // of calling `resolveTileSource()` twice. Config comes through DI
  // (`TILE_PROVIDER_CONFIG`, defined above) rather than a direct `environment`
  // import, so which provider this renders with is whatever got provided —
  // see that token's doc comment.
  private readonly tileSource = resolveTileSource(inject(TILE_PROVIDER_CONFIG));

  /**
   * Renders the MapTiler logo overlay (`.app-map__maptiler-logo` in the
   * template) — see `ResolvedTileSource.isFallback`'s doc comment for why
   * this is gated on "using the configured provider" rather than always on.
   * A plain readonly field (not a signal) is intentional: `tileProvider` is
   * static app config, never changes after this component is constructed.
   */
  protected readonly showMapTilerLogo = !this.tileSource.isFallback;

  // How far `fitPins` will zoom in when `pin`/`userPin` happen to be close
  // together — without a cap, `fitBounds()` on two near-identical points
  // zooms to Leaflet's max, which reads as "the map is broken", not
  // "precise". See the class doc comment.
  private static readonly FIT_BOUNDS_MAX_ZOOM = 16;
  private static readonly FIT_BOUNDS_PADDING: [number, number] = [56, 56];
  // `.app-map__scroll-hint` shows for this long after an un-modified wheel is
  // intercepted (matches the approved design's own demo timing).
  private static readonly SCROLL_HINT_MS = 1100;

  private map: Leaflet.Map | null = null;
  private leaflet: typeof Leaflet | null = null;
  private markerLayer: Leaflet.Marker | null = null;
  private userMarkerLayer: Leaflet.Marker | null = null;
  private circleLayer: Leaflet.Circle | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;
  private anyTileLoaded = false;
  private anyTileErrored = false;
  private errorReported = false;

  // Decided ONCE, at construction, from the primary pointer's capability —
  // never from viewport width (a touchscreen laptop with a trackpad reports
  // `pointer: fine` here and correctly gets the desktop Ctrl-gate behaviour
  // instead of the touch overlay). `typeof matchMedia` is guarded the same
  // way `ResizeObserver` is above: absent in a test host or an unusually old
  // runtime, this just degrades to "not touch" rather than throwing.
  private readonly isTouchCapable: boolean =
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  /** `true` while the touch scroll-gate overlay (`.app-map__gate`) should be
   *  showing: opted in via `scrollGate`, only meaningful for an `interactive`,
   *  non-`crosshair` map (a full-screen picker has no page scroll to protect),
   *  only on a touch-primary pointer, and only until the visitor taps it once
   *  (`touchGateOpen`, below — a signal because it flips at runtime, unlike
   *  `isTouchCapable`, which is fixed for this instance's whole lifetime). */
  private readonly touchGateOpen = signal(false);
  protected readonly showTouchGate = computed(
    () =>
      this.scrollGate() &&
      this.interactive() &&
      !this.crosshair() &&
      this.isTouchCapable &&
      !this.touchGateOpen(),
  );

  /** `true` for ~`SCROLL_HINT_MS` after an un-modified wheel over the map was
   *  intercepted (desktop half of the scroll gate) — see `onGateWheel()`. */
  protected readonly showScrollHint = signal(false);
  private scrollHintTimer: ReturnType<typeof setTimeout> | null = null;
  // Bound once so `removeEventListener` in `ngOnDestroy` can find the exact
  // same function reference `addEventListener` used.
  private readonly onGateWheel = (event: WheelEvent): void => {
    if (event.ctrlKey || event.metaKey) return; // let Leaflet handle it — zoom, not scroll.
    // Capture-phase `stopPropagation()` on the wrapper (an ANCESTOR of the
    // Leaflet-owned surface) halts the event before it ever reaches
    // Leaflet's own listener — see the class doc comment.
    event.stopPropagation();
    this.showScrollHint.set(true);
    if (this.scrollHintTimer !== null) clearTimeout(this.scrollHintTimer);
    this.scrollHintTimer = setTimeout(
      () => this.showScrollHint.set(false),
      MapComponent.SCROLL_HINT_MS,
    );
  };
  private wheelListenerAttached = false;

  constructor() {
    // Re-centre / re-zoom an already-created map when a caller changes these
    // inputs (e.g. re-opening the picker on a previously-set pin). `fitPins`
    // (below) never feeds back into `center`/`zoom`, so it can never make
    // THIS effect re-fire itself — see the class doc comment.
    effect(() => {
      const c = this.center();
      const z = this.zoom();
      this.map?.setView([c.lat, c.lng], z, { animate: false });
    });

    // Keep the static pin marker, user-location marker, uncertainty circle,
    // and the two-pin fitBounds framing in sync with the inputs that decide
    // them. One effect for all four (rather than one each) because they
    // share the same "map may not exist yet" guard and the same
    // `crosshair`/`pin` reads — see `init()` for why each `syncXxx()` is ALSO
    // called directly right after map creation (this effect's first run can
    // race that creation).
    effect(() => {
      this.pin();
      this.userPin();
      this.crosshair();
      this.circleRadiusMeters();
      this.circleDashed();
      this.fitPins();
      this.syncMarker();
      this.syncUserMarker();
      this.syncCircle();
      this.syncFitBounds();
    });
  }

  ngAfterViewInit(): void {
    void this.init();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.scrollHintTimer !== null) clearTimeout(this.scrollHintTimer);
    this.scrollHintTimer = null;
    if (this.wheelListenerAttached) {
      this.wrapperRef().nativeElement.removeEventListener('wheel', this.onGateWheel, {
        capture: true,
      });
      this.wheelListenerAttached = false;
    }
    this.map?.remove();
    this.map = null;
  }

  private async init(): Promise<void> {
    try {
      const imported = await import('leaflet');
      // The component may have been destroyed (e.g. dialog closed) while the
      // dynamic import was in flight.
      if (this.destroyed) return;
      const L = resolveLeafletModule(imported);
      this.leaflet = L;

      const interactive = this.interactive();
      // Starting state for the touch half of the scroll gate: if the gate
      // overlay is showing (`showTouchGate()` — opted in, interactive,
      // non-crosshair, touch-primary pointer), the map must not itself be
      // draggable/pinch-zoomable yet, or a touch would reach past the
      // overlay to Leaflet underneath. `dismissTouchGate()` re-enables both
      // on the live map once the visitor taps through.
      const gateTouchInitially = this.showTouchGate();
      const c = this.center();
      const map = L.map(this.containerRef().nativeElement, {
        center: [c.lat, c.lng],
        zoom: this.zoom(),
        // Always this component's own `.app-map__zoom-stack` (top-right),
        // never Leaflet's built-in control — see the class doc comment.
        zoomControl: false,
        dragging: interactive && !gateTouchInitially,
        // Left tied to `interactive` regardless of `scrollGate`: the gate
        // never disables Leaflet's zoom handler itself, only whether an
        // un-modified wheel event ever reaches it — see `attachScrollGate()`.
        scrollWheelZoom: interactive,
        doubleClickZoom: interactive,
        touchZoom: interactive && !gateTouchInitially,
        boxZoom: interactive,
        keyboard: interactive,
        // Always on — a licence requirement of the active tile source (see
        // `resolveTileSource()`), not gated by interactivity.
        attributionControl: true,
      });
      this.map = map;

      if (interactive && this.scrollGate() && !this.crosshair()) {
        this.attachScrollGate();
      }

      const tileSource = this.tileSource;
      const tileLayer = L.tileLayer(tileSource.url, {
        maxZoom: tileSource.maxZoom,
        attribution: tileSource.attribution,
      }).addTo(map);

      // Detect a dead tile server. `tileload`/`tileerror` fire per tile;
      // `load` fires once the whole batch has settled either way (see the
      // class doc comment) — that's the point at which "at least one error,
      // and not a single success" means every tile in view failed, i.e. the
      // tile host itself is unreachable rather than one stray 404.
      tileLayer.on('tileload', () => {
        this.anyTileLoaded = true;
      });
      tileLayer.on('tileerror', () => {
        this.anyTileErrored = true;
      });
      tileLayer.on('load', () => {
        if (this.anyTileErrored && !this.anyTileLoaded && !this.destroyed) {
          this.reportError();
        }
      });

      if (this.crosshair()) {
        const emitCenter = () => {
          const center = map.getCenter();
          this.centerChange.emit({ lat: center.lat, lng: center.lng });
        };
        map.on('moveend', emitCenter);
        // Report the starting centre immediately — a confirm without any pan
        // still needs a coordinate to submit.
        emitCenter();
      } else {
        this.syncMarker();
        this.syncUserMarker();
        this.syncCircle();
        this.syncFitBounds();
      }

      // Leaflet measures its container's pixel size at creation time; if that
      // happens before the container has its final layout (a step just became
      // visible, a dialog is still animating open, a keyboard/orientation
      // change resizes it later), the map keeps the stale size until told
      // otherwise. A `ResizeObserver` on the container calls `invalidateSize()`
      // on every REAL box-size change, however long that takes to arrive —
      // unlike a fixed-delay `setTimeout`, it cannot race an animation of
      // unknown duration, and it keeps working for any later resize too (a
      // one-shot timer wouldn't). See `map.component.spec.ts` for the wiring
      // assertion (jsdom has no native `ResizeObserver`, so the spec mocks the
      // global) and this class's doc comment for why a *different* bug (the
      // encapsulation gap) — not container-sizing timing — was actually
      // behind the patchy-tiles symptom this replaced a race for.
      //
      // `ResizeObserver` is a widely-supported browser global (not present in
      // jsdom, the test DOM this repo's specs run against, unless a spec
      // explicitly stubs it — see `map.component.spec.ts`) — guarded rather
      // than assumed so a test host or an unusually old runtime degrades to
      // "no resize safety-net" instead of throwing here and, via the
      // surrounding `catch`, reporting `mapError` for a map that actually
      // rendered fine.
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => map.invalidateSize());
        this.resizeObserver.observe(this.containerRef().nativeElement);
      }
    } catch {
      // `import('leaflet')` rejected, or map/tile-layer setup threw
      // synchronously (e.g. no canvas/SVG support). Report and bail — no
      // partial map is left behind for the caller to render around.
      this.reportError();
    }
  }

  private reportError(): void {
    if (this.errorReported) return;
    this.errorReported = true;
    this.mapError.emit();
  }

  private syncMarker(): void {
    const L = this.leaflet;
    const map = this.map;
    if (!L || !map) return;

    if (this.markerLayer) {
      map.removeLayer(this.markerLayer);
      this.markerLayer = null;
    }

    const p = this.pin();
    // The crosshair overlay IS the pin in that mode — never show both.
    if (p && !this.crosshair()) {
      this.markerLayer = L.marker([p.lat, p.lng], {
        icon: this.pinIcon(L),
        interactive: false,
        keyboard: false,
      }).addTo(map);
    }
  }

  private syncCircle(): void {
    const L = this.leaflet;
    const map = this.map;
    if (!L || !map) return;

    if (this.circleLayer) {
      map.removeLayer(this.circleLayer);
      this.circleLayer = null;
    }

    const p = this.pin();
    const radius = this.circleRadiusMeters();
    // Same reasoning as the marker: the crosshair mode has no fixed pin to
    // circle, so never draw one there.
    if (p && radius !== null && radius > 0 && !this.crosshair()) {
      const primary = this.readPrimaryColor();
      this.circleLayer = L.circle([p.lat, p.lng], {
        radius,
        color: primary,
        weight: 1.5,
        opacity: 0.55,
        fillColor: primary,
        fillOpacity: 0.16,
        interactive: false,
        // `undefined` (not `false`/`''`) is deliberate — Leaflet's own SVG
        // renderer treats a falsy-but-present `dashArray` as "explicitly no
        // dash pattern", but only OMITTING the option entirely matches the
        // solid-stroke behaviour this circle had before `circleDashed`
        // existed, so existing callers that never set it see zero change.
        dashArray: this.circleDashed() ? '6 6' : undefined,
      }).addTo(map);
    }
  }

  /** Mirrors `syncMarker()` for `userPin` — a second, differently-styled
   *  marker (see `userIcon()`) rather than a variant of the same one, since a
   *  caller may show both `pin` and `userPin` at once (that is the whole
   *  point of `fitPins`). Suppressed in `crosshair` mode for the same reason
   *  `pin`/the circle are: no fixed coordinate to anchor a second marker to. */
  private syncUserMarker(): void {
    const L = this.leaflet;
    const map = this.map;
    if (!L || !map) return;

    if (this.userMarkerLayer) {
      map.removeLayer(this.userMarkerLayer);
      this.userMarkerLayer = null;
    }

    const u = this.userPin();
    if (u && !this.crosshair()) {
      this.userMarkerLayer = L.marker([u.lat, u.lng], {
        icon: this.userIcon(L),
        interactive: false,
        keyboard: false,
      }).addTo(map);
    }
  }

  /** Imperative, one-shot `fitBounds()` call — see the class doc comment for
   *  why this must never write back into the `center` input (NG0103). A
   *  no-op unless `fitPins` is on, both `pin` and `userPin` are set, and
   *  `crosshair` is off (a fixed crosshair coordinate isn't a real "pin" to
   *  frame together with the visitor's location). */
  private syncFitBounds(): void {
    const L = this.leaflet;
    const map = this.map;
    if (!L || !map) return;
    if (!this.fitPins() || this.crosshair()) return;

    const p = this.pin();
    const u = this.userPin();
    if (!p || !u) return;

    const bounds = L.latLngBounds([
      [p.lat, p.lng],
      [u.lat, u.lng],
    ]);
    map.fitBounds(bounds, {
      padding: MapComponent.FIT_BOUNDS_PADDING,
      maxZoom: MapComponent.FIT_BOUNDS_MAX_ZOOM,
      animate: false,
    });
  }

  /** Reads the live `--ui-color-primary` value off this component's own host
   *  so Leaflet's SVG renderer (which resolves colour strings once, outside
   *  Angular's style encapsulation) always matches the app's actual token
   *  instead of a value baked in at build time. */
  private readPrimaryColor(): string {
    const FALLBACK = '#ff6008';
    const el = this.containerRef()?.nativeElement;
    if (!el || typeof getComputedStyle !== 'function') return FALLBACK;
    const value = getComputedStyle(el).getPropertyValue('--ui-color-primary').trim();
    return value || FALLBACK;
  }

  private pinIcon(L: typeof Leaflet): Leaflet.DivIcon {
    return L.divIcon({
      className: 'app-map__marker',
      html: '<span class="app-map__marker-halo"></span><span class="app-map__marker-dot"></span>',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  }

  /** Unlike `pinIcon()`'s marker (a Leaflet SVG-renderer colour, resolved via
   *  `readPrimaryColor()`), this is a `divIcon` — plain HTML Leaflet drops
   *  into its marker pane — so `.app-map__user-dot` can reference
   *  `--ui-color-map-user` directly in `map.component.scss`; no JS
   *  colour-reading step is needed here. */
  private userIcon(L: typeof Leaflet): Leaflet.DivIcon {
    // A single `.app-map__user-dot` span, unlike `pinIcon()`'s separate
    // halo + dot pair — the pulsing halo here is a `::before` pseudo-element
    // on the dot itself (see map.component.scss), matching the approved
    // design's own `.userdot::before` structure.
    return L.divIcon({
      className: 'app-map__user-marker',
      html: '<span class="app-map__user-dot"></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  protected zoomIn(): void {
    this.map?.zoomIn();
  }

  protected zoomOut(): void {
    this.map?.zoomOut();
  }

  /** Tapping `.app-map__gate` (template) calls this: enables dragging/pinch
   *  on the LIVE map and hides the overlay (`touchGateOpen`) for the rest of
   *  this component's lifetime — see `showTouchGate` and the class doc
   *  comment's "Touch" bullet. */
  protected dismissTouchGate(): void {
    this.touchGateOpen.set(true);
    this.map?.dragging.enable();
    this.map?.touchZoom.enable();
  }

  /** Desktop half of the scroll gate — see the class doc comment's "Desktop"
   *  bullet for the full mechanism. Attaches `onGateWheel` on `wrapperRef`
   *  (an ANCESTOR of Leaflet's own container) during the CAPTURE phase, as a
   *  `passive` listener: it never calls `preventDefault()` (an un-modified
   *  wheel must still scroll the PAGE natively), only `stopPropagation()` to
   *  keep the event from ever reaching Leaflet's `scrollWheelZoom` handler. */
  private attachScrollGate(): void {
    this.wrapperRef().nativeElement.addEventListener('wheel', this.onGateWheel, {
      capture: true,
      passive: true,
    });
    this.wheelListenerAttached = true;
  }
}
