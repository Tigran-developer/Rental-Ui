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
import { dorentSymbolMarkup } from '../dorent-symbol/dorent-symbol.markup';

/**
 * A latitude/longitude pair. The only "coordinate" shape this component's
 * public API speaks — callers never see a Leaflet type.
 */
export interface MapLatLng {
  lat: number;
  lng: number;
}

/**
 * One clustered catalog pin — the public API's whole notion of "a marker
 * group" (Maps P2-2). `key` is the STABLE identity a caller and this
 * component both use to track the same group across re-renders (see
 * `markers`' doc comment below for the diffing contract this enables) — the
 * public coordinate pair as a string, e.g. `"40.177600,44.512600"`, since two
 * listings sharing the exact same fuzzed (geohash-cell-centroid) coordinate
 * ARE the same group by construction.
 */
export interface MapMarkerGroup {
  key: string;
  position: MapLatLng;
  /** How many listings share this exact public coordinate. */
  count: number;
}

/**
 * A marker group's on-screen pixel position, from
 * `Leaflet.Map.latLngToContainerPoint()` — emitted so the parent can render
 * its OWN popup UI (routerLink/translate/image/card-stack — see the class
 * doc comment on why this component doesn't use `L.popup`) positioned over
 * this component without ever needing a Leaflet type itself.
 */
export interface MapMarkerAnchor {
  key: string;
  x: number;
  y: number;
}

/** The visible map viewport, from `Leaflet.Map.getBounds()` — emitted on
 *  `viewportChanged` so a caller can refetch markers for the area the
 *  visitor actually panned/zoomed to. */
export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
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
export const TILE_PROVIDER_CONFIG = new InjectionToken<TileProviderConfig>('TILE_PROVIDER_CONFIG', {
  providedIn: 'root',
  factory: () => environment.tileProvider,
});

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
 * Bookkeeping for one live catalog-pin marker (Maps P2-2) — never part of
 * this component's public API. `el` is the marker's own icon `HTMLElement`
 * (`Leaflet.Marker.getElement()`), used to imperatively toggle
 * `.is-animating`/`.is-active` and read `aria-label` updates without
 * recreating the marker (see `markers`' doc comment for why an unchanged
 * `key` must never be torn down).
 *
 * `hovered` is the raw pointer state (`true` between `onMarkerHoverStart`/
 * `onMarkerHoverEnd`). `desiredAnimating` — the ADR-011/M-024 falling-edge
 * latch — is `hovered OR (this group is currently `highlightedMarkerKey`)`,
 * recomputed by `updateDesiredAnimating()` any time EITHER half changes: the
 * two are kept as separate fields precisely so leaving a HIGHLIGHTED
 * marker's hover does not fall through to "stop animating" (the group must
 * keep bouncing because it's highlighted, even though the pointer left it).
 * The `animationiteration` listener below only clears `.is-animating` once
 * the loop has eased back to rest AND `desiredAnimating` is still `false` —
 * mirroring `DorentSymbolComponent`'s own `animating` signal, just expressed
 * imperatively since this DOM is raw Leaflet `divIcon` HTML, never an
 * Angular template.
 */
interface MarkerEntry {
  readonly marker: Leaflet.Marker;
  readonly group: MapMarkerGroup;
  readonly el: HTMLElement | null;
  readonly ballEl: HTMLElement | null;
  hovered: boolean;
  desiredAnimating: boolean;
}

// SVG/HTML `id` characters only — a marker group's `key` is a coordinate
// string like `"40.177600,44.512600"` (commas, dots, and a possible leading
// `-` for southern/western hemispheres), none of which are valid alone in
// every context an id can appear. Collisions are impossible as long as the
// input keys are themselves unique, which `MapMarkerGroup.key` already
// guarantees by contract.
function sanitizeForClipId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
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
 * changed. The marker/crosshair rules in map.component.scss (`.app-map__marker*`,
 * `.app-map__user-*`) are, for the same reason, plain global class selectors
 * with NO `:host`/`::ng-deep` — under `None`, Angular emits this component's
 * compiled CSS completely unshimmed (no `_ngcontent-*` scoping attribute is
 * generated at all, so there is nothing for `:host`/`::ng-deep` to scope
 * against). `::ng-deep` is not a real CSS pseudo-element the browser
 * understands; a selector like `:host ::ng-deep .app-map__marker` is simply
 * invalid CSS once `:host` stops being rewritten, and a browser drops the
 * WHOLE rule, not just the scoping part. That exact mistake shipped once
 * (`:host ::ng-deep` left in map.component.scss after the switch to `None`)
 * and silently killed both the orange `pin` dot and the blue `userPin` dot —
 * see `map.component.spec.ts` for the regression assertion pinning this.
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
 * `circleRadiusMeters` (P1-8): when set, draws a translucent circle of that
 * radius — used by the detail-page map to show the honest uncertainty radius
 * of a fuzzed (geohash-7-snapped) coordinate, and by the full-screen
 * reference-point picker to preview the chosen search radius live. Centred on
 * `pin` normally; in `crosshair` mode (no `pin` exists there) it is instead
 * centred on the map's own current centre — i.e. the crosshair's target,
 * tracked imperatively via the same `moveend` source `centerChange` reports
 * to the caller (see `crosshairCenter`/`syncCircle()`) — so the circle pans
 * WITH the map and stays geographically accurate at any zoom, rather than a
 * caller approximating its on-screen size in CSS for one fixed zoom level (a
 * real `L.Circle` is defined in metres, so Leaflet itself keeps it the
 * correct pixel size through every zoom change; only re-centring it on pan
 * needs this component's own help, since the crosshair's coordinate has no
 * Angular input to react to). Its stroke/fill colour is read from the
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
 * `crosshair` mode for the same reason `pin` is: the crosshair overlay has no
 * fixed coordinate to anchor a second marker to either. (`circleRadiusMeters`
 * is NOT suppressed there — see its own doc comment above: unlike a marker, a
 * circle can be re-centred on the map's own moving centre instead.)
 *
 * `userAccuracyMeters`: a translucent circle around `userPin`, drawn by
 * `syncUserAccuracyCircle()` the same way `circleRadiusMeters` draws one
 * around `pin` (a real `L.Circle`, defined in metres — via `readUserColor()`
 * rather than `readPrimaryColor()`, since this MUST read as a different
 * colour from the listing's own orange uncertainty ring: the two answer
 * different questions — how fuzzed the listing's public coordinate is vs. how
 * confident the visitor's own device fix is — and both can be on screen
 * together. `null` (default, and whenever `GeolocationService` couldn't
 * report a confidence radius) draws no circle. Same suppression rules as
 * `userPin`'s own marker: nothing is drawn without a `userPin`, and nothing is
 * drawn in `crosshair` mode (no fixed `userPin` coordinate to anchor to
 * there).
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
  private readonly containerRef = viewChild.required<ElementRef<HTMLDivElement>>('container');
  // The `.app-map` wrapper — an ANCESTOR of `containerRef` (Leaflet's own
  // container). The scroll-gate wheel listener attaches here rather than on
  // `containerRef` — see the class doc comment's "Desktop" bullet for why
  // ancestor-capture, not same-element-capture, is what makes listener order
  // deterministic against Leaflet's own `scrollWheelZoom` handler.
  private readonly wrapperRef = viewChild.required<ElementRef<HTMLDivElement>>('wrapper');

  readonly center = input.required<MapLatLng>();
  readonly zoom = input<number>(13);
  readonly pin = input<MapLatLng | null>(null);
  /** When `false`, `pin` is not rendered as its own marker (`syncMarker()`)
   *  — it still anchors `syncCircle()`/`syncFitBounds()` exactly as before.
   *  Default `true` keeps every existing caller (`location-picker`,
   *  `listing-location`, `create-listing-form`, the catalogue map) byte-for-
   *  byte unchanged. Used by the listing-detail maps: the current listing is
   *  drawn as one of `markers()`' catalogue-style groups instead (so it can
   *  bounce/highlight exactly like every other listing — see
   *  `highlightedMarkerKey`), and a second orange teardrop `pin` at the SAME
   *  coordinate would just be a duplicate marker on top of it. */
  readonly showPin = input<boolean>(true);
  readonly height = input<string>('280px');
  readonly interactive = input<boolean>(false);
  readonly crosshair = input<boolean>(false);
  /** Radius (metres) of the translucent uncertainty circle drawn at `pin`. `null` (default) draws no circle. */
  readonly circleRadiusMeters = input<number | null>(null);
  /** Dashed stroke instead of solid for the `circleRadiusMeters` circle — see the class doc comment. */
  readonly circleDashed = input<boolean>(false);
  /** A second, blue pulsing marker (the visitor's own location) — see the class doc comment. */
  readonly userPin = input<MapLatLng | null>(null);
  /** Radius (metres) of the translucent accuracy circle drawn around `userPin`
   *  — see the class doc comment. `null` (default) draws no circle. */
  readonly userAccuracyMeters = input<number | null>(null);
  /** When both `pin` and `userPin` are set, frame both via `fitBounds()` instead of `center`/`zoom`. */
  readonly fitPins = input<boolean>(false);
  /** When `fitPins` is on, whether `syncFitBounds()` also includes `markers()`
   *  groups in the frame. Default `true` keeps the catalogue map (which has
   *  no `pin`/`userPin` of its own, so this was already the only source of
   *  points there) byte-for-byte unchanged. `false` restricts the frame to
   *  `pin`/`userPin` only — used by the listing-detail map, which draws
   *  every OTHER listing as a `markers()` group too and must never let
   *  "frame me and the toy" stretch out to fit every other listing on the
   *  map as well. */
  readonly fitIncludesMarkers = input<boolean>(true);
  /** Opts an `interactive` (non-`crosshair`) map into the scroll/touch capture gate — see the class doc comment. */
  readonly scrollGate = input<boolean>(false);
  /** Translated `aria-label` for the `+` zoom button. `null` (default) leaves it unlabelled. */
  readonly zoomInLabel = input<string | null>(null);
  /** Translated `aria-label` for the `−` zoom button. `null` (default) leaves it unlabelled. */
  readonly zoomOutLabel = input<string | null>(null);

  /** Clustered catalog pins (Maps P2-2) — one marker per group, diffed by
   *  `MapMarkerGroup.key` so an unrelated input change never tears down and
   *  rebuilds markers a caller didn't touch (the parent refetches on every
   *  map pan — see `viewportChanged` below — so this runs often). */
  readonly markers = input<MapMarkerGroup[]>([]);
  /** Radius (metres) of a translucent circle drawn around EVERY marker
   *  group. `null` (default) draws none — mirrors `circleRadiusMeters`, but
   *  per-group rather than a single circle at `pin`. */
  readonly markerRadiusMeters = input<number | null>(null);
  /** Below this zoom, marker circles are not rendered at all — a small
   *  real-world radius is sub-pixel DOM garbage at a zoomed-out view. */
  readonly markerCircleMinZoom = input<number>(12);
  /** The group whose popup the PARENT currently has open — drives a
   *  `.is-active` class on that group's marker. `null` (default): none. */
  readonly activeMarkerKey = input<string | null>(null);
  /** The group PERMANENTLY highlighted (not merely while hovered or
   *  popped-open) — gets `activeMarkerKey`'s `.is-active` ring PLUS a
   *  CONTINUOUS bounce (`.is-animating`), independent of hover/popup state.
   *  `null` (default): none. Deliberately a SEPARATE signal from
   *  `activeMarkerKey`, not a variant of it: the listing-detail map needs
   *  BOTH roles live at once, and potentially on two DIFFERENT groups at the
   *  same time — the current listing bounces forever (this input), while a
   *  NEIGHBOURING group's popup can be open simultaneously
   *  (`activeMarkerKey`). See `MarkerEntry.desiredAnimating` and
   *  `updateDesiredAnimating()` for how hover and this combine into one
   *  animation state per marker, and `applyActiveClass()` for how this and
   *  `activeMarkerKey` combine into one `.is-active` state — both combine
   *  rather than each effect setting the class/state off its own single
   *  condition, so the two effects driving them can never fight over the
   *  same marker. The falling edge (this input changing to no longer match
   *  a group) goes through the exact same ADR-011/M-024
   *  immediate-vs-`animationiteration` branch a hover ending does. */
  readonly highlightedMarkerKey = input<string | null>(null);
  /** Translated `aria-label` for a single-listing marker (`count === 1`).
   *  Opaque to this file, exactly like `zoomInLabel`/`zoomOutLabel` — no
   *  ngx-translate import here. */
  readonly markerLabel = input<string>('');
  /** Translated `aria-label` TEMPLATE for a multi-listing marker (`count >
   *  1`) — a single string shared by every group, containing a literal
   *  `{count}` placeholder the caller leaves unresolved (e.g. "5 toys at
   *  this spot" -> "{count} toys at this spot"). This file substitutes each
   *  group's OWN `count` when building its icon (see `labelForGroup()`), so
   *  a group of 2 and a group of 7 announce differently instead of sharing
   *  one opaque string — the same ngx-translate-ignorant convention as
   *  `markerLabel`/`zoomInLabel`/`zoomOutLabel`, just with one placeholder
   *  this file knows how to replace. */
  readonly markerGroupLabel = input<string>('');

  readonly centerChange = output<MapLatLng>();
  readonly mapError = output<void>();
  /** A marker group's on-screen anchor, on `mouseover` (with the anchor) and
   *  `mouseout` (`null`) — see `MapMarkerAnchor`'s doc comment. Also
   *  re-emitted (never `null`) on `move`/`zoom` for whichever group is
   *  currently hovered OR `activeMarkerKey` (hover takes priority when both
   *  are set to two different groups), so a caller's popup — positioned
   *  from the last anchor this emitted — stays glued to its group while the
   *  map pans/zooms instead of drifting off it mid-gesture. */
  readonly markerHovered = output<MapMarkerAnchor | null>();
  /** A marker group's `key`, on `click` and on Enter/Space while it holds
   *  keyboard focus. */
  readonly markerActivated = output<string>();
  /** The visible viewport, on `moveend` — see `MapBounds`. */
  readonly viewportChanged = output<MapBounds>();
  /**
   * A click on the map BACKGROUND (never a marker) — Leaflet's own `click`
   * event on the map instance, which its interactive-layer machinery
   * (`interactive: true` markers, same as this component's catalog pins)
   * stops from bubbling up when the click actually landed on a marker, so
   * this never double-fires alongside `markerActivated`. Exists for Maps
   * P2-2's catalogue map: `ListingsMapComponent` closes a pinned-open popup
   * on Esc, a close button, OR a click on the map background — this is the
   * third of those, and nothing else in this component's contract can
   * express "the visitor clicked the map itself".
   */
  readonly mapClicked = output<void>();

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
  // The catalog pin's `iconSize` — the ball fills this box edge-to-edge
  // (ADR-011: ink diameter == box size), so `iconAnchor` below is HALF this
  // for x and the FULL value for y — the ball's ground-contact point (its
  // bottom edge) sits on the geo coordinate, not its vertical centre; the
  // shadow ellipse paints below that via `overflow: visible`, never shifting
  // the anchor itself.
  private static readonly PIN_ICON_SIZE = 24;

  private map: Leaflet.Map | null = null;
  private leaflet: typeof Leaflet | null = null;
  private markerLayer: Leaflet.Marker | null = null;
  private userMarkerLayer: Leaflet.Marker | null = null;
  private userAccuracyCircleLayer: Leaflet.Circle | null = null;
  private circleLayer: Leaflet.Circle | null = null;
  // Catalog pins (Maps P2-2), keyed by `MapMarkerGroup.key` — diffed rather
  // than torn down and rebuilt on every input change, see `markers`' doc
  // comment above.
  private readonly markerGroupLayers = new Map<string, MarkerEntry>();
  private readonly markerGroupCircles = new Map<string, Leaflet.Circle>();
  // The group currently under the POINTER (native `mouseover`/`mouseout` on
  // its marker element) — distinct from `activeMarkerKey` (an input, the
  // group whose popup the PARENT has open). Both drive the `move`/`zoom`
  // anchor re-emit below; see `markerHovered`'s doc comment for the
  // precedence between them.
  private hoveredMarkerKey: string | null = null;
  // The crosshair's current geo position (`crosshair` mode only) — kept as a
  // plain field, not a signal: it is written and read entirely from the
  // imperative `moveend`/initial `emitCenter()` calls in `init()` (mirroring
  // how `centerChange` already reports the same value to the caller), never
  // from Angular's own change detection, so a signal would add nothing here.
  private crosshairCenter: MapLatLng | null = null;
  /**
   * The catalogue map's own auto-fit → refetch loop hazard (Maps P2-2): a
   * caller's `viewportChanged` handler refetches `markers` for the new
   * viewport; if that response is fed back into `markers` while `fitPins`
   * is still on, `syncFitBounds()` reruns, calls `fitBounds()` again, which
   * fires ITS OWN `moveend` — indistinguishable, from the `moveend` handler
   * below's point of view, from a visitor genuinely panning the map. Left
   * unbroken that is fetch → fit → moveend → fetch … forever. This flag is
   * the half of the fix that belongs HERE: only `MapComponent` itself knows
   * a given `moveend` was caused by ITS OWN `fitBounds()` call rather than a
   * real user gesture, so only it can suppress emitting `viewportChanged`
   * for that one event. `syncFitBounds()` sets this immediately before
   * calling `fitBounds()` and clears it immediately after — Leaflet's
   * `fitBounds(..., { animate: false })` calls `setView` synchronously,
   * which fires `moveend` synchronously in the same call stack when the
   * view actually changes, so the moveend handler below always finds the
   * flag still `true` for the event it needs to swallow. Clearing it
   * unconditionally right after the call (rather than only inside the
   * handler) also makes this self-healing if the fit was a no-op (already
   * framed — Leaflet then never fires `moveend` at all): the flag would
   * otherwise stay stuck `true` and incorrectly swallow the NEXT real pan's
   * `viewportChanged`.
   *
   * The OTHER half of the fix is the caller's responsibility, not this
   * component's — `ListingsMapComponent` (Maps P2-2) must only turn
   * `fitPins` on for the response of a `bounds: null` request (initial open
   * / filter change), never for a viewport-driven one. Suppressing the
   * self-caused `moveend` here alone is not sufficient: without that other
   * half, a viewport-driven response would still call `fitBounds()` again
   * (silently re-centring the view the visitor just panned to) even though
   * this flag correctly stops it from ALSO re-triggering a fetch.
   */
  private suppressNextMoveend = false;
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

  // Read ONCE, at construction, mirroring `DorentSymbolComponent`'s own guard
  // (see ADR-011 / M-024) — a marker's hover-driven `.is-animating` class
  // must clear IMMEDIATELY on the falling edge when this is `true`, because
  // the reduced-motion media query removes the `@keyframes` rule entirely,
  // so the `animationiteration` event this otherwise defers to never fires.
  // Deferring anyway would leave the shadow permanently visible after the
  // first hover — exactly M-024's second defect, reproduced here for the map
  // pin instead of the header ball.
  private readonly prefersReducedMotionForMarkers: boolean =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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
      this.showPin();
      this.userPin();
      this.userAccuracyMeters();
      this.crosshair();
      this.circleRadiusMeters();
      this.circleDashed();
      this.fitPins();
      this.fitIncludesMarkers();
      this.markers();
      this.syncMarker();
      this.syncUserMarker();
      this.syncUserAccuracyCircle();
      this.syncCircle();
      this.syncFitBounds();
    });

    // Catalog pins (Maps P2-2) — a separate effect from the one above:
    // `markers`/`markerRadiusMeters`/`markerCircleMinZoom` are a genuinely
    // independent feature (clustered search-result pins) from the single
    // `pin`/`userPin` a caller like the listing-detail map shows, and mixing
    // their sync calls into one effect would re-run the OTHER feature's sync
    // on every unrelated change for no reason.
    effect(() => {
      this.markers();
      this.markerRadiusMeters();
      this.markerCircleMinZoom();
      this.syncMarkerGroups();
      this.syncMarkerGroupCircles();
    });

    // `activeMarkerKey` only ever needs to toggle a class on markers that
    // ALREADY exist — never a reason to touch marker creation/removal, so it
    // gets its own effect rather than folding into the one above (which
    // would otherwise re-diff every marker whenever the parent merely opens
    // a different popup). `applyActiveClass()` re-derives the FULL `.is-active`
    // truth from BOTH `activeMarkerKey` and `highlightedMarkerKey` (see that
    // method's doc comment) rather than toggling off this signal alone, so
    // this effect and the next one can never fight over the same class.
    effect(() => {
      this.activeMarkerKey();
      for (const entry of this.markerGroupLayers.values()) {
        this.applyActiveClass(entry);
      }
    });

    // `highlightedMarkerKey` — the listing-detail map's "this is MY toy"
    // marker. A separate effect from the one above for the exact same
    // reason `activeMarkerKey`'s is separate from the marker-diffing effect:
    // this only ever needs to toggle state on markers that ALREADY exist.
    // Also drives the continuous-bounce half (`updateDesiredAnimating()`),
    // not just the ring — see `highlightedMarkerKey`'s own doc comment.
    effect(() => {
      this.highlightedMarkerKey();
      for (const entry of this.markerGroupLayers.values()) {
        this.applyActiveClass(entry);
        this.updateDesiredAnimating(entry);
      }
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
    // `map.remove()` already tears down every layer it owns — this just
    // drops OUR bookkeeping so nothing here holds a dangling reference.
    this.markerGroupLayers.clear();
    this.markerGroupCircles.clear();
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
          const latLng: MapLatLng = { lat: center.lat, lng: center.lng };
          // Tracks the crosshair's current geo position for `syncCircle()`
          // (below) — there is no `pin` input in this mode, so the circle
          // must follow the SAME imperative moveend source `centerChange`
          // reports to the caller, not an Angular input.
          this.crosshairCenter = latLng;
          this.syncCircle();
          this.centerChange.emit(latLng);
        };
        map.on('moveend', emitCenter);
        // Report the starting centre immediately — a confirm without any pan
        // still needs a coordinate to submit.
        emitCenter();
      } else {
        this.syncMarker();
        this.syncUserMarker();
        this.syncUserAccuracyCircle();
        this.syncCircle();
        this.syncFitBounds();
      }

      // Catalog pins (Maps P2-2) — independent of `crosshair`/`pin`/`userPin`
      // above; a caller using `markers` (the catalogue map) never sets
      // `crosshair`, but nothing here assumes that.
      this.syncMarkerGroups();
      this.syncMarkerGroupCircles();

      // `viewportChanged` — always wired, not just when `markers` happens to
      // be non-empty right now, so a caller that starts with an empty
      // catalogue still gets told where the visitor panned to.
      map.on('moveend', () => {
        // See `suppressNextMoveend`'s own doc comment — swallows exactly the
        // `moveend` this component's own `syncFitBounds()` just caused, so a
        // caller's viewport-driven refetch never sees it as a user pan.
        if (this.suppressNextMoveend) {
          this.suppressNextMoveend = false;
          return;
        }
        this.viewportChanged.emit(this.currentBounds());
      });

      // `markerCircleMinZoom` is compared against the LIVE zoom (`map.
      // getZoom()`), which only Leaflet knows — re-run the circle sync once
      // a zoom gesture settles so circles appear/disappear exactly as the
      // visitor crosses the threshold, not only when an Angular input
      // happens to change.
      map.on('zoomend', () => this.syncMarkerGroupCircles());

      // `mapClicked` — see its own doc comment. Leaflet's interactive marker
      // layers stop this event from bubbling up for a click that landed on
      // one of THEM, so this only fires for a genuine background click.
      map.on('click', () => this.mapClicked.emit());

      // A hovered OR active marker's popup must stay glued to it while the
      // map pans/zooms (see `markerHovered`'s doc comment) — `move`/`zoom`
      // fire repeatedly DURING the gesture/animation, unlike `moveend`/
      // `zoomend` above (once, after it settles), which is what keeps the
      // anchor from visibly lagging behind the marker mid-gesture.
      const recomputeTrackedAnchor = () => {
        const key = this.hoveredMarkerKey ?? this.activeMarkerKey();
        if (key === null) return;
        this.markerHovered.emit(this.anchorForGroupKey(key));
      };
      map.on('move', recomputeTrackedAnchor);
      map.on('zoom', recomputeTrackedAnchor);

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
    // The crosshair overlay IS the pin in that mode — never show both. Also
    // suppressed when `showPin` is off — see that input's doc comment: `pin`
    // still anchors `syncCircle()`/`syncFitBounds()` below, it just never
    // becomes its OWN rendered marker.
    if (p && !this.crosshair() && this.showPin()) {
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

    // In `crosshair` mode there is no fixed `pin` coordinate to anchor a
    // circle to (that's still true, and why the marker/user-marker/fitBounds
    // stay suppressed there — see `syncMarker()`/`syncUserMarker()`/
    // `syncFitBounds()`) — but the crosshair IS a real, if constantly moving,
    // geo point: the map's own current centre, tracked in `crosshairCenter`
    // by `init()`'s `emitCenter()`. Centring the circle there instead lets it
    // pan and re-scale with the map exactly like the `pin` circle already
    // does — Leaflet's `L.Circle` is defined in real metres, so a zoom alone
    // re-renders it correctly with no extra work; only re-centring on pan
    // needs this component's own help, since the crosshair's coordinate has
    // no Angular input to react to.
    const center = this.crosshair() ? this.crosshairCenter : this.pin();
    const radius = this.circleRadiusMeters();
    if (center && radius !== null && radius > 0) {
      const primary = this.readPrimaryColor();
      this.circleLayer = L.circle([center.lat, center.lng], {
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
   *  `pin` is: no fixed coordinate to anchor a second marker to (unlike
   *  `circleRadiusMeters`'s circle, which re-centres on the crosshair
   *  instead — see `syncCircle()`). */
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

  /** Mirrors `syncCircle()`, for the visitor's OWN confidence radius instead
   *  of the listing's fuzzed-coordinate uncertainty — see `userAccuracyMeters`'
   *  doc comment on the class for why this circle must read in a DIFFERENT
   *  colour (`readUserColor()` / `--ui-color-map-user`, not
   *  `readPrimaryColor()` / `--ui-color-primary`) from `syncCircle()`'s own.
   *  Drawn only when `userPin`, a positive `userAccuracyMeters`, AND
   *  non-`crosshair` all hold — the same three-way gate `syncUserMarker()`
   *  uses for the marker itself (no fixed `userPin` coordinate exists in
   *  `crosshair` mode to anchor a circle to either). */
  private syncUserAccuracyCircle(): void {
    const L = this.leaflet;
    const map = this.map;
    if (!L || !map) return;

    if (this.userAccuracyCircleLayer) {
      map.removeLayer(this.userAccuracyCircleLayer);
      this.userAccuracyCircleLayer = null;
    }

    const u = this.userPin();
    const radius = this.userAccuracyMeters();
    if (u && radius !== null && radius > 0 && !this.crosshair()) {
      const userColor = this.readUserColor();
      this.userAccuracyCircleLayer = L.circle([u.lat, u.lng], {
        radius,
        color: userColor,
        weight: 1.5,
        opacity: 0.55,
        fillColor: userColor,
        fillOpacity: 0.16,
        interactive: false,
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

    // `pin`/`userPin` first (matches this method's pre-`markers` call order
    // exactly, so existing callers passing only those two see byte-identical
    // `L.latLngBounds()` input), then every catalog-pin group — all three
    // sources are optional and combine into one frame.
    const points: [number, number][] = [];
    const p = this.pin();
    const u = this.userPin();
    if (p) points.push([p.lat, p.lng]);
    if (u) points.push([u.lat, u.lng]);
    if (this.fitIncludesMarkers()) {
      for (const group of this.markers()) {
        points.push([group.position.lat, group.position.lng]);
      }
    }
    // Fitting a single point isn't really "fitting" anything — same
    // threshold the pre-`markers` `pin`+`userPin` check already enforced
    // (both had to be set).
    if (points.length < 2) return;

    const bounds = L.latLngBounds(points);
    // See `suppressNextMoveend`'s own doc comment for why this is set
    // immediately before the call and cleared immediately after, rather than
    // only inside the `moveend` handler.
    this.suppressNextMoveend = true;
    map.fitBounds(bounds, {
      padding: MapComponent.FIT_BOUNDS_PADDING,
      maxZoom: MapComponent.FIT_BOUNDS_MAX_ZOOM,
      animate: false,
    });
    this.suppressNextMoveend = false;
  }

  /** `Leaflet.Map.getBounds()`, translated to this component's own
   *  `MapBounds` shape — the only place a Leaflet `LatLngBounds` value is
   *  read at all, matching this file's "no Leaflet type crosses the public
   *  API" rule. */
  private currentBounds(): MapBounds {
    const bounds = this.map!.getBounds();
    return {
      minLat: bounds.getSouth(),
      maxLat: bounds.getNorth(),
      minLng: bounds.getWest(),
      maxLng: bounds.getEast(),
    };
  }

  /** `Leaflet.Map.latLngToContainerPoint()` for one marker group, translated
   *  to `MapMarkerAnchor` — `null` if the group no longer exists (it was
   *  removed from `markers` in the same tick a hover/active key still
   *  referenced it) or the map isn't up yet. */
  private anchorForGroupKey(key: string): MapMarkerAnchor | null {
    const map = this.map;
    if (!map) return null;
    const group = this.markers().find((g) => g.key === key);
    if (!group) return null;
    const point = map.latLngToContainerPoint([group.position.lat, group.position.lng]);
    return { key, x: point.x, y: point.y };
  }

  /** Already-translated `aria-label` for one group — `markerLabel` for
   *  `count === 1`; for `count > 1`, `markerGroupLabel()`'s `{count}`
   *  placeholder substituted with THIS group's own count (see that input's
   *  doc comment for why per-group substitution matters: a group of 2 and a
   *  group of 7 must not announce identically). */
  private labelForGroup(group: MapMarkerGroup): string {
    if (group.count <= 1) return this.markerLabel();
    return this.markerGroupLabel().replace('{count}', String(group.count));
  }

  /** The catalog pin's inner HTML: the shared brand-ball markup (section C
   *  of the Maps P2-2 plan — see `dorent-symbol.markup.ts`) plus a count
   *  badge when more than one listing shares this group's coordinate. */
  private markerGroupHtml(group: MapMarkerGroup, clipId: string): string {
    const badge = group.count > 1 ? `<span class="app-map__pin-badge">${group.count}</span>` : '';
    return dorentSymbolMarkup(clipId) + badge;
  }

  /** Diffs `markers` against the live `markerGroupLayers` map BY KEY — only
   *  groups that appeared/disappeared since the last sync are created/
   *  removed; an unchanged key is left alone (its marker is never torn down
   *  and rebuilt), and a group whose `count` changed updates the SAME
   *  marker's badge/aria-label in place. See `markers`' doc comment for why
   *  this matters: the parent refetches on every map pan. */
  private syncMarkerGroups(): void {
    const L = this.leaflet;
    const map = this.map;
    if (!L || !map) return;

    const groups = this.markers();
    const currentKeys = new Set(groups.map((g) => g.key));

    for (const [key, entry] of this.markerGroupLayers) {
      if (!currentKeys.has(key)) {
        map.removeLayer(entry.marker);
        this.markerGroupLayers.delete(key);
        if (this.hoveredMarkerKey === key) this.hoveredMarkerKey = null;
      }
    }

    for (const group of groups) {
      const existing = this.markerGroupLayers.get(group.key);
      if (existing) {
        this.updateMarkerEntry(existing, group);
        continue;
      }
      this.markerGroupLayers.set(group.key, this.createMarkerEntry(L, map, group));
    }
  }

  /** Builds one group's marker + icon, wires its hover/click/keyboard
   *  handlers directly on the icon element (`marker.getElement()`) rather
   *  than through Leaflet's own event bus — this needs Enter/Space keyboard
   *  activation too, which isn't a standard Leaflet-fired event, so
   *  everything is handled uniformly at the DOM level instead of splitting
   *  mouse events one way and keyboard another. Contrast with `pinIcon()`
   *  (:822-ish, static `pin` marker): that one is `interactive: false` and
   *  its CSS sets `pointer-events: none` — this marker is the opposite on
   *  purpose, it must be hoverable and clickable. */
  private createMarkerEntry(
    L: typeof Leaflet,
    map: Leaflet.Map,
    group: MapMarkerGroup,
  ): MarkerEntry {
    const clipId = `dr-symbol-clip-map-${sanitizeForClipId(group.key)}`;
    const icon = L.divIcon({
      className: 'app-map__pin',
      html: this.markerGroupHtml(group, clipId),
      iconSize: [MapComponent.PIN_ICON_SIZE, MapComponent.PIN_ICON_SIZE],
      // Bottom-CENTRE, not the box's vertical centre — the ball's ground
      // contact point (its bottom edge in the 0-100 viewBox) must sit on the
      // geo coordinate; the shadow ellipse painting further below it
      // (`overflow: visible`) never shifts this.
      iconAnchor: [MapComponent.PIN_ICON_SIZE / 2, MapComponent.PIN_ICON_SIZE],
    });
    const marker = L.marker([group.position.lat, group.position.lng], {
      icon,
      interactive: true,
      keyboard: true,
    }).addTo(map);

    const el = marker.getElement?.() ?? null;
    const entry: MarkerEntry = {
      marker,
      group,
      el,
      ballEl: el?.querySelector<HTMLElement>('.dr-symbol__ball') ?? null,
      hovered: false,
      desiredAnimating: false,
    };

    if (el) {
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.setAttribute('aria-label', this.labelForGroup(group));
      // A newly-created marker (e.g. a re-pan created a new group key) picks
      // up BOTH the ring and — if it's the highlighted group — the
      // continuous bounce immediately, rather than waiting for the next
      // `activeMarkerKey`/`highlightedMarkerKey` effect run.
      this.applyActiveClass(entry);
      this.updateDesiredAnimating(entry);

      // Permanent listener (mirrors `DorentSymbolComponent`'s own
      // `(animationiteration)` binding, see class doc comment there): the
      // falling edge only actually clears the class once the loop has eased
      // back through its rest keyframe, UNLESS reduced motion means there
      // was never a loop to begin with (see `updateDesiredAnimating()` below).
      entry.ballEl?.addEventListener('animationiteration', () => {
        if (!entry.desiredAnimating) el.classList.remove('is-animating');
      });

      el.addEventListener('mouseover', () => this.onMarkerHoverStart(entry));
      el.addEventListener('mouseout', () => this.onMarkerHoverEnd(entry));
      // `activateGroup()` (not just `markerActivated.emit`) also emits this
      // group's current anchor via `markerHovered` — needed for the touch
      // and keyboard paths, which reach this WITHOUT a preceding `mouseover`
      // (unlike a desktop click, which the browser always fires a real
      // `mouseover` ahead of, so the anchor is already known by the time
      // `click` lands there). Without this, a caller has no pixel position
      // to open a popup at until the visitor happens to pan the map at
      // least once afterward — see `ListingsMapComponent`, Maps P2-2. Shared
      // with the group's own radius circle (`syncMarkerGroupCircles()`) so
      // clicking the circle activates the group identically to clicking the
      // ball itself.
      const activate = () => this.activateGroup(group.key);
      el.addEventListener('click', activate);
      el.addEventListener('keydown', (event: Event) => {
        const key = (event as KeyboardEvent).key;
        if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
          event.preventDefault();
          activate();
        }
      });
    }

    return entry;
  }

  /** Emits `markerHovered` with the group's current anchor, then
   *  `markerActivated` with its key — the ball's own click/Enter/Space
   *  handler (`createMarkerEntry()`, above) and the group radius circle's
   *  `click` handler (`syncMarkerGroupCircles()`, below) both funnel through
   *  here so a click on either produces byte-identical behaviour. See
   *  `createMarkerEntry()`'s `activate()` comment for why the anchor is
   *  (re-)emitted here too, not just on click. */
  private activateGroup(key: string): void {
    this.markerHovered.emit(this.anchorForGroupKey(key));
    this.markerActivated.emit(key);
  }

  /** Updates an EXISTING marker's badge/aria-label in place when its
   *  `count` changes without recreating the marker — see `syncMarkerGroups`'
   *  doc comment. */
  private updateMarkerEntry(entry: MarkerEntry, group: MapMarkerGroup): void {
    const el = entry.el;
    if (!el) return;
    el.setAttribute('aria-label', this.labelForGroup(group));
    let badge = el.querySelector<HTMLElement>('.app-map__pin-badge');
    if (group.count > 1) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'app-map__pin-badge';
        el.appendChild(badge);
      }
      badge.textContent = String(group.count);
    } else {
      badge?.remove();
    }
  }

  private onMarkerHoverStart(entry: MarkerEntry): void {
    entry.hovered = true;
    this.updateDesiredAnimating(entry);
    this.hoveredMarkerKey = entry.group.key;
    this.markerHovered.emit(this.anchorForGroupKey(entry.group.key));
  }

  private onMarkerHoverEnd(entry: MarkerEntry): void {
    entry.hovered = false;
    // Recomputes the combined desired state — if this group is also
    // `highlightedMarkerKey`, `updateDesiredAnimating()` finds it still
    // desired and leaves `.is-animating` alone, so leaving a HIGHLIGHTED
    // marker's hover never stops its permanent bounce.
    this.updateDesiredAnimating(entry);
    if (this.hoveredMarkerKey === entry.group.key) this.hoveredMarkerKey = null;
    this.markerHovered.emit(null);
  }

  /** Combines `activeMarkerKey` (the parent's open popup) and
   *  `highlightedMarkerKey` (the permanently-highlighted "this is the
   *  current listing" marker) into the single `.is-active` ring class — see
   *  both inputs' own doc comments for why they're independent signals that
   *  can each be `true` for a DIFFERENT group at the same time. Centralised
   *  here, rather than each effect toggling the class off its own single
   *  condition, so the two effects driving them can never fight over the
   *  same class: each just re-derives the FULL truth from both signals,
   *  regardless of which one changed. */
  private applyActiveClass(entry: MarkerEntry): void {
    const isActive =
      entry.group.key === this.activeMarkerKey() || entry.group.key === this.highlightedMarkerKey();
    entry.el?.classList.toggle('is-active', isActive);
  }

  /** Recomputes `entry.desiredAnimating` (hover ∪ highlighted) and applies
   *  the ADR-011/M-024-safe falling edge — see `MarkerEntry`'s own doc
   *  comment. Called from `onMarkerHoverStart`/`onMarkerHoverEnd` (the hover
   *  half) and the `highlightedMarkerKey` effect (the highlight half);
   *  either can flip the COMBINED value, so both funnel through here rather
   *  than toggling the class or setting `desiredAnimating` directly. */
  private updateDesiredAnimating(entry: MarkerEntry): void {
    const desired = entry.hovered || entry.group.key === this.highlightedMarkerKey();
    entry.desiredAnimating = desired;
    if (desired) {
      entry.el?.classList.add('is-animating');
      return;
    }
    // Falling edge — mirrors the pre-existing M-024 branch this replaces:
    // under reduced motion no CSS animation loop ever runs, so the
    // `animationiteration` listener attached in `createMarkerEntry()` (which
    // checks `entry.desiredAnimating`, already `false` here) never fires;
    // clear immediately instead of leaving the shadow stuck forever. Under
    // normal motion, this is deliberately a no-op — the loop eases itself
    // back through its own rest keyframe first, and `animationiteration`
    // removes the class from there.
    if (this.prefersReducedMotionForMarkers) {
      entry.el?.classList.remove('is-animating');
    }
  }

  /** Mirrors `syncCircle()` for `markers`: one translucent `L.circle` per
   *  group, diffed by key the same way `syncMarkerGroups()` diffs markers.
   *  Gated on BOTH `markerRadiusMeters` being set AND the live zoom being at
   *  least `markerCircleMinZoom` — re-run on every `zoomend` (see `init()`)
   *  as well as on the relevant input changes, since only Leaflet knows the
   *  live zoom.
   *
   *  UNLIKE `syncCircle()`'s single `pin`/`crosshair` circle (always
   *  `interactive: false` — decorative only), these per-group circles are
   *  `interactive: true` and wired with the SAME hover/click behaviour as
   *  the group's own ball marker: the approved design wants the radius
   *  circle itself to be the hover/click TARGET (it reads as a much bigger,
   *  easier-to-hit affordance than the 24px ball alone), not just a
   *  decoration drawn under it. `mouseover`/`mouseout` reuse
   *  `onMarkerHoverStart()`/`onMarkerHoverEnd()` verbatim (same bounce +
   *  `markerHovered` emission the ball's own hover already produces);
   *  `click` reuses `activateGroup()` (same as the ball's click/keyboard
   *  activation). Every handler looks the `MarkerEntry` up LAZILY, via
   *  `this.markerGroupLayers.get(key)` AT EVENT TIME, rather than closing
   *  over the entry captured when the circle was created: circles here and
   *  markers in `syncMarkerGroups()` are diffed/recreated independently (two
   *  separate diff loops sharing one effect — see the constructor), so a
   *  captured entry reference could go stale and point at an already
   *  torn-down marker. The ball's OWN hover/click/keyboard handlers
   *  (`createMarkerEntry()`) are untouched — a circle only renders when
   *  `markerRadiusMeters` is set and the live zoom clears
   *  `markerCircleMinZoom`, so the ball must keep working as a target on its
   *  own; this is purely additive.
   *
   *  `bubblingMouseEvents: false` is required, not optional decoration:
   *  Leaflet's `Path` (which `Circle` extends) defaults this to `true` —
   *  UNLIKE `Marker`, whose own default is `false` — so without it, a click
   *  on the circle would ALSO bubble up and fire the map's own `click`
   *  (`mapClicked`, see `init()`), right on top of the `markerActivated`
   *  this circle's own handler already emits. `ListingsMapComponent` treats
   *  `mapClicked` as "close the pinned popup", which would immediately
   *  undo the very click that just opened it. With this off, a circle click
   *  behaves exactly like a ball click (a `Marker`, already
   *  `bubblingMouseEvents: false` by default).
   *
   *  A pointer moving from the circle onto the ball fires the browser's
   *  `mouseout`(circle) then `mouseover`(ball) as two separate events, never
   *  simultaneously — the transient `markerHovered(null)` the `mouseout`
   *  produces is absorbed by `ListingsMapComponent`'s own
   *  `POPUP_CLOSE_GRACE_MS` (150ms) close-grace timer, the same mechanism
   *  that already lets a visitor's pointer travel from the ball to its own
   *  popup without the popup flickering shut in between.
   *
   *  Cursor: no extra CSS needed here — Leaflet's own `leaflet.css` (bundled
   *  via `@use` in map.component.scss) already sets `cursor: pointer` on
   *  every `.leaflet-interactive` SVG path, a class an `interactive: true`
   *  circle gets automatically from Leaflet's SVG renderer. */
  private syncMarkerGroupCircles(): void {
    const L = this.leaflet;
    const map = this.map;
    if (!L || !map) return;

    const radius = this.markerRadiusMeters();
    const shouldShow = radius !== null && radius > 0 && map.getZoom() >= this.markerCircleMinZoom();
    const groups = shouldShow ? this.markers() : [];
    const currentKeys = new Set(groups.map((g) => g.key));

    for (const [key, circle] of this.markerGroupCircles) {
      if (!currentKeys.has(key)) {
        map.removeLayer(circle);
        this.markerGroupCircles.delete(key);
      }
    }

    if (!shouldShow) return;

    const primary = this.readPrimaryColor();
    for (const group of groups) {
      if (this.markerGroupCircles.has(group.key)) continue;
      const key = group.key;
      const circle = L.circle([group.position.lat, group.position.lng], {
        radius: radius!,
        color: primary,
        weight: 1.5,
        opacity: 0.55,
        fillColor: primary,
        fillOpacity: 0.16,
        interactive: true,
        // See this method's own doc comment — Path's default (true) would
        // otherwise let a circle click also fire the map's own `click`.
        bubblingMouseEvents: false,
      }).addTo(map);
      circle.on('mouseover', () => {
        const entry = this.markerGroupLayers.get(key);
        if (entry) this.onMarkerHoverStart(entry);
      });
      circle.on('mouseout', () => {
        const entry = this.markerGroupLayers.get(key);
        if (entry) this.onMarkerHoverEnd(entry);
      });
      circle.on('click', () => this.activateGroup(key));
      this.markerGroupCircles.set(group.key, circle);
    }
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

  /** Same resolve-the-live-custom-property trick as `readPrimaryColor()`
   *  above, for `--ui-color-map-user` instead — see `syncUserAccuracyCircle()`'s
   *  doc comment for why the visitor's own accuracy circle must never share
   *  `readPrimaryColor()`'s colour with the listing's uncertainty circle.
   *  Fallback matches the token's literal value in `styles.css`. */
  private readUserColor(): string {
    const FALLBACK = '#2f6bff';
    const el = this.containerRef()?.nativeElement;
    if (!el || typeof getComputedStyle !== 'function') return FALLBACK;
    const value = getComputedStyle(el).getPropertyValue('--ui-color-map-user').trim();
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
