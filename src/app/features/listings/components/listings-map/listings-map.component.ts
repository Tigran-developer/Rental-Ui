import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, debounceTime } from 'rxjs';

import type {
  MapBounds,
  MapLatLng,
  MapMarkerAnchor,
  MapMarkerGroup,
} from '../../../../shared/ui/map/map.component';
import { MapComponent } from '../../../../shared/ui/map/map.component';
import { APPROXIMATE_AREA_RADIUS_METERS } from '../../models/approximate-area.const';
import type { ListingPinGroup } from '../../models/listing-pin-group.util';
import { groupPinsByCoordinate } from '../../models/listing-pin-group.util';
import type { MapPinsBounds } from '../../models/map-pins-bounds.model';
import { DEFAULT_PICKER_ZOOM, YEREVAN_CENTER } from '../location-picker/location-picker.component';
import * as ListingsActions from '../../store/listings.actions';
import {
  selectListingsFilters,
  selectMapPins,
  selectMapPinsError,
  selectMapPinsLoading,
  selectMapPinsTruncated,
} from '../../store/listings.selectors';
import { ListingsMapPopupComponent } from '../listings-map-popup/listings-map-popup.component';

/** How long after a `viewportChanged` (pan/zoom settling) this waits before
 *  refetching pins for the new viewport — long enough that a visitor
 *  dragging/zooming repeatedly only fires one request for the gesture, not
 *  one per intermediate `moveend`. */
const VIEWPORT_DEBOUNCE_MS = 400;

/** How long a popup stays open after the pointer leaves the marker before
 *  actually closing — long enough for the pointer to travel from the ball
 *  to the popup itself (rendered with no gap, but still a real screen
 *  distance) without the popup already having disappeared. */
const POPUP_CLOSE_GRACE_MS = 150;

/** The popup's rendered pixel width — OWNED by this component's own
 *  `.listings-map__popup-anchor` (a fixed-width wrapper in
 *  listings-map.component.scss), not by `listings-map-popup.component.scss`'s
 *  `:host` (that stylesheet makes the card fluid — `width: 100%` — so it
 *  fills whichever container renders it, the single-card anchor OR
 *  `.listings-map__popup-stack`, instead of overflowing a narrower stack
 *  body and getting clipped by its `overflow: hidden` — the defect this
 *  ownership split fixed: a fixed 220px card `:host` inside a ~204px-wide
 *  stack content box). Kept here (not imported — nothing to import from once
 *  the popup component owns no layout constant of its own) so this
 *  component's own edge-clamping math agrees with what actually renders.
 *  Keep this in sync with `.listings-map__popup-anchor`'s `width` in
 *  listings-map.component.scss. */
const POPUP_WIDTH_PX = 264;

/** Conservative height estimate used for edge-clamping math, matching this
 *  component's own `.listings-map__popup-stack-body` `max-height` (see the
 *  stylesheet) — a single popup card renders shorter than this, so using the
 *  group-stack cap everywhere is a safe (if occasionally too generous)
 *  upper bound, never an under-estimate that would let a popup overflow the
 *  map's edge. */
const POPUP_MAX_HEIGHT_PX = 320;

/** Mirrors `MapComponent`'s own private `PIN_ICON_SIZE` (the ball icon is a
 *  24×24 box, anchored bottom-centre) — needed here to compute where the
 *  ball's OWN top edge is (`anchor.y - MARKER_ICON_SIZE_PX`), since a
 *  `MapMarkerAnchor` only reports the anchor point (the ball's ground
 *  contact point), not its bounding box. `MapComponent` doesn't expose this
 *  as a public constant today; if its icon size ever changes, this needs
 *  updating alongside it. */
const MARKER_ICON_SIZE_PX = 24;

/** Minimum gap (px) kept between a popup and the map container's own edge
 *  when clamping. */
const EDGE_MARGIN_PX = 8;

/**
 * Maps P2-2: the catalogue map view — owns `app-map`, dispatches
 * `loadMapPins` (initial/filter-driven with `bounds: null`, debounced
 * viewport-driven with real bounds), and renders `ListingsMapPopupComponent`
 * (single or stacked) at the hovered/activated marker group's anchor.
 *
 * `fitPins` discipline (the loop hazard this feature's plan calls out
 * explicitly): `[fitPins]` is bound to `fitPinsPulse()`, a signal that is
 * pulsed `true` for exactly one microtask ONLY when the just-completed fetch
 * was the `bounds: null` kind (initial open or a filter change — tracked via
 * `awaitingInitialFit`, not the store, since NgRx has no notion of "which
 * request kind resolved"). A viewport-driven response never pulses it, so
 * `MapComponent`'s own `fitPins`-reactive effect (which re-runs
 * `syncFitBounds()` on every `markers` change while `fitPins` is on) never
 * re-frames the view the visitor just panned to. The OTHER half of the loop
 * fix — swallowing the `moveend` `fitBounds()` itself causes — lives in
 * `MapComponent.syncFitBounds()`/its `suppressNextMoveend` field; both
 * halves are required together, see that field's own doc comment.
 *
 * Second consumer (this increment): the listing-detail page's two maps
 * (`listing-location`, `listing-location-map`) reuse this SAME component
 * rather than duplicating its viewport-debounce/loop-guard/popup-positioning
 * machinery — every input below defaults to the catalogue's own existing
 * behaviour byte-for-byte, so `<app-listings-map />` with no inputs (as
 * `ListingsPageComponent` already uses it) is unchanged. The detail page
 * instead sets `scope="all"`, `activeListingId`, `anchorPin`/`userPin`,
 * `autoFit="false"`, and suppresses the two catalogue-scale banners — see
 * each input's own doc comment.
 */
@Component({
  selector: 'app-listings-map',
  standalone: true,
  imports: [MapComponent, ListingsMapPopupComponent, TranslatePipe],
  templateUrl: './listings-map.component.html',
  styleUrl: './listings-map.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingsMapComponent {
  private readonly store = inject(Store);

  private readonly mapWrapperRef = viewChild<ElementRef<HTMLElement>>('mapWrapper');

  /** `'filtered'` (default — today's, and the catalogue's, only behaviour):
   *  pins are fetched against the CURRENT catalogue filters/origin, same as
   *  the results list. `'all'`: fetched with NO filter and NO origin (see
   *  `ListingsEffects.loadMapPins$`) — the listing-detail maps' mode, which
   *  must show every toy regardless of whatever search the visitor last ran
   *  on `/listings`. */
  readonly scope = input<'filtered' | 'all'>('filtered');
  /** The current listing's id (listing-detail usage only) — resolves to the
   *  `MapMarkerGroup.key` of whichever fetched group CONTAINS a pin with
   *  this id (`highlightedMarkerKey`, below), fed straight into the wrapped
   *  `app-map`'s `[highlightedMarkerKey]`. `null` (default, catalogue
   *  usage): nothing highlighted. Looked up by id rather than by re-deriving
   *  a key from `anchorPin`'s own coordinate — the fetched pin's published
   *  coordinate is already geohash-snapped and grouped, so matching by id is
   *  exact where re-deriving a rounded key would just repeat that work.
   *  `null` while the id isn't (yet) in the fetched response — no crash,
   *  simply no highlight until it arrives. */
  readonly activeListingId = input<string | null>(null);
  /** Initial map centre. Default: Republic Square, Yerevan — today's
   *  catalogue behaviour (`YEREVAN_CENTER`, unchanged). */
  readonly center = input<MapLatLng>(YEREVAN_CENTER);
  /** Initial zoom. Default: the catalogue's own city-level framing
   *  (`DEFAULT_PICKER_ZOOM`, unchanged). */
  readonly zoom = input<number>(DEFAULT_PICKER_ZOOM);
  /** Inline override for `.listings-map__map-wrap`'s height. `null`
   *  (default) leaves the catalogue's own responsive CSS breakpoints
   *  (`listings-map.component.scss`) in charge — exactly today's behaviour.
   *  The listing-detail maps pass an explicit value instead (a fixed custom
   *  property for the small card, `100%` for the full-screen dialog). */
  readonly height = input<string | null>(null);
  /** The visitor's own location (listing-detail usage) — passed straight
   *  through to the wrapped `app-map`'s `[userPin]`. `null` (default,
   *  catalogue usage — this map has no "my location" affordance today): no
   *  second marker. */
  readonly userPin = input<MapLatLng | null>(null);
  /** The browser's own confidence radius (metres) for `userPin` (listing-
   *  detail usage) — passed straight through to the wrapped `app-map`'s own
   *  `[userAccuracyMeters]`. `null` (default, catalogue usage): no accuracy
   *  circle. This component doesn't compute or hold this value itself —
   *  `ListingLocationComponent` does, same ownership split as `userPin`. */
  readonly userAccuracyMeters = input<number | null>(null);
  /** The current listing's own coordinate (listing-detail usage) — fed to
   *  the wrapped `app-map` as `[pin]` with `[showPin]="false"` in this
   *  component's OWN template (see `MapComponent.showPin`'s doc comment): a
   *  pure `fitBounds()` anchor, never a second rendered marker — the SAME
   *  listing already appears as one of `markers()`' groups (and gets
   *  highlighted via `activeListingId`), so a second orange teardrop at the
   *  same coordinate would just double up. `null` (default, catalogue
   *  usage): no anchor. */
  readonly anchorPin = input<MapLatLng | null>(null);
  /** `true` (default — today's catalogue behaviour): auto-fits to the
   *  search results after every non-viewport-driven fetch (`fitPinsPulse`,
   *  unchanged) and lets `markers()` groups count toward that frame
   *  (bound straight through to the wrapped `app-map`'s
   *  `[fitIncludesMarkers]`). `false` (listing-detail usage): `fitPinsPulse`
   *  never pulses at all — the map opens centred on the listing at `zoom`
   *  and stays there rather than reframing to the whole fetched pin set.
   *  The ONE framing that still happens with `autoFit=false` is
   *  `anchorPin`+`userPin` once the visitor's own location becomes known
   *  (`fitAnchorPulse`, below) — restricted to just those two points by
   *  `fitIncludesMarkers=false`, never the whole catalogue of pins. */
  readonly autoFit = input<boolean>(true);
  /** `true` (default): shows the "nothing here" empty-state message when the
   *  fetch resolved with zero pins. `false` (listing-detail usage):
   *  suppressed — a listing-detail map always has at least the current
   *  listing, so "empty" never legitimately applies the way it does for an
   *  over-filtered catalogue search. Loading/error banners are unaffected by
   *  this input — they show in both usages. */
  readonly showEmptyBanner = input<boolean>(true);
  /** `true` (default): shows the "zoom in to see more" truncated-results
   *  banner. `false` (listing-detail usage): suppressed — the 500-pin cap
   *  this banner warns about is a catalogue-scale concern the detail page's
   *  own small map never meaningfully approaches. */
  readonly showTruncatedBanner = input<boolean>(true);
  /** `true` (default — today's catalogue behaviour): opts the wrapped
   *  `app-map` into its scroll/touch capture gate (`MapComponent.scrollGate`
   *  — a plain wheel scrolls the PAGE, Ctrl/⌘+wheel zooms the map; a touch
   *  pointer needs one tap through a gate overlay before it can drag).
   *  `false`: the full-screen listing-location dialog, which has no
   *  surrounding page scroll to protect and no page to protect it FROM — the
   *  gate there would just be an extra, pointless tap before the visitor can
   *  pan a map that already fills the whole viewport. Mirrors this
   *  component's OWN prior hardcoded `[scrollGate]="true"` on its wrapped
   *  `app-map` for the default, so the catalogue map is unaffected. */
  readonly scrollGate = input<boolean>(true);

  /** Re-emits the wrapped `app-map`'s own `mapError` — otherwise lost now
   *  that a caller (the listing-detail maps) needs it and this component
   *  sits between that caller and `app-map`. */
  readonly mapError = output<void>();

  protected readonly markerRadiusMeters = APPROXIMATE_AREA_RADIUS_METERS;

  protected readonly pins = this.store.selectSignal(selectMapPins);
  protected readonly loading = this.store.selectSignal(selectMapPinsLoading);
  protected readonly error = this.store.selectSignal(selectMapPinsError);
  protected readonly truncated = this.store.selectSignal(selectMapPinsTruncated);

  protected readonly groups = computed<ListingPinGroup[]>(() => groupPinsByCoordinate(this.pins()));
  protected readonly markers = computed<MapMarkerGroup[]>(() =>
    this.groups().map((group) => ({
      key: group.key,
      position: { lat: group.latitude, lng: group.longitude },
      count: group.pins.length,
    })),
  );

  protected readonly isEmpty = computed(
    () => !this.loading() && this.error() === null && this.pins().length === 0,
  );

  /** See `activeListingId`'s own doc comment. */
  protected readonly highlightedMarkerKey = computed<string | null>(() => {
    const id = this.activeListingId();
    if (id === null) return null;
    return this.groups().find((group) => group.pins.some((pin) => pin.id === id))?.key ?? null;
  });

  /** Pulsed `true` for one microtask after a `bounds: null` fetch resolves —
   *  see the class doc comment's "`fitPins` discipline" section. Never
   *  pulsed at all while `autoFit` is off — see that input's doc comment. */
  protected readonly fitPinsPulse = signal(false);

  /** Pulsed `true` for one microtask when the visitor's OWN location becomes
   *  known while `autoFit` is off (listing-detail usage) — see `autoFit`'s
   *  own doc comment. Deliberately a PULSE, not a persistent binding (unlike
   *  the old `[fitPins]="hasUserPin()"` this replaces on
   *  `ListingLocationComponent`): with `markers()` now populated (this
   *  component fetches every listing's pin for the whole map), a persistent
   *  `true` would re-run `syncFitBounds()` — and silently re-centre the view
   *  right back onto `anchorPin`+`userPin` — on every background
   *  viewport-driven refetch that changes `markers()`, undoing a visitor's
   *  manual pan on the detail map. See `MapComponent.suppressNextMoveend`'s
   *  own doc comment for the exact failure mode this pulse discipline
   *  avoids (it describes the SAME hazard for `fitPinsPulse`). */
  protected readonly fitAnchorPulse = signal(false);

  /** The group whose popup is currently shown (hovered OR pinned). `null`:
   *  nothing open. Bound straight back into `app-map`'s `[activeMarkerKey]`
   *  so panning/zooming keeps the anchor glued to it — see
   *  `MapComponent.markerHovered`'s own doc comment for why that binding is
   *  what makes that work. */
  protected readonly openKey = signal<string | null>(null);
  protected readonly anchor = signal<MapMarkerAnchor | null>(null);
  /** `true` once opened via `markerActivated` (click/Enter/tap) — blocks the
   *  hover-driven auto-close grace timer AND hover-opening a DIFFERENT
   *  marker until explicitly closed (Esc / close button / map-background
   *  click). This exclusivity isn't spelled out one way or the other by the
   *  plan; treating a pinned popup as modal-until-dismissed (rather than
   *  letting a stray hover elsewhere silently swap it) is this component's
   *  own call — flagged for review. */
  protected readonly pinned = signal(false);

  protected readonly openGroup = computed<ListingPinGroup | null>(() => {
    const key = this.openKey();
    if (key === null) return null;
    return this.groups().find((group) => group.key === key) ?? null;
  });

  /** Clamped/flipped inline position for the popup anchor wrapper — `null`
   *  while nothing is open. See the class doc comment on the popup-sizing
   *  constants above for why height uses a fixed conservative estimate
   *  rather than a measured `ResizeObserver` value. */
  protected readonly popupStyle = computed<{ left: string; top: string } | null>(() => {
    const a = this.anchor();
    if (a === null) return null;

    const containerRect = this.mapWrapperRef()?.nativeElement.getBoundingClientRect();
    const containerWidth = containerRect?.width ?? Number.POSITIVE_INFINITY;
    const containerHeight = containerRect?.height ?? Number.POSITIVE_INFINITY;

    let left = a.x - POPUP_WIDTH_PX / 2;
    left = Math.max(
      EDGE_MARGIN_PX,
      Math.min(left, containerWidth - POPUP_WIDTH_PX - EDGE_MARGIN_PX),
    );

    // Prefer directly ABOVE the ball, its own top edge, no gap; flip BELOW
    // (starting at the ball's ground-contact point) when there isn't room.
    const ballTop = a.y - MARKER_ICON_SIZE_PX;
    const fitsAbove = ballTop - POPUP_MAX_HEIGHT_PX >= EDGE_MARGIN_PX;
    const top = fitsAbove ? ballTop - POPUP_MAX_HEIGHT_PX : a.y;

    return { left: `${left}px`, top: `${top}px` };
  });

  private readonly viewportChanges$ = new Subject<MapPinsBounds>();
  /** Whether the LAST dispatched `loadMapPins` was `bounds: null` — read
   *  once, when a fetch's `loading` flips back to `false` (see the
   *  constructor), to decide whether THIS resolution is allowed to pulse
   *  `fitPinsPulse`. Deliberately a plain field, not store state: NgRx has
   *  no notion of "which request kind resolved", and `switchMap` in
   *  `ListingsEffects.loadMapPins$` means only the LATEST dispatch's kind
   *  ever matters (a superseded one never resolves at all). */
  private awaitingInitialFit = false;
  /** The bounds the last `loadMapPins` was dispatched with — `retry()`
   *  re-dispatches the SAME request rather than silently resetting to the
   *  unbounded (filter-only) one. */
  private lastBounds: MapPinsBounds | null = null;
  private wasLoading = false;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  /** `document.activeElement` at the moment a popup opened — restored on
   *  Esc (see `onEscape()`) so a keyboard user's focus lands back on the
   *  marker they were on, not nowhere. Desktop/keyboard activation of a
   *  marker always leaves it focused (it has `tabIndex="0"`), so capturing
   *  "whatever has focus right now" at open time reliably captures the
   *  marker itself without `ListingsMapComponent` needing a handle on
   *  `MapComponent`'s internal Leaflet DOM at all. */
  private lastFocusedTrigger: HTMLElement | null = null;

  constructor() {
    // Initial fetch + every filter change. `effect()` (not a `filters$`
    // subscription) is enough here: `selectListingsFilters` is a memoized
    // NgRx selector that only returns a NEW `filters` object reference when
    // `updateFilters`/`resetListings` actually runs, so this naturally never
    // re-fires for an unrelated action — and `effect()` always runs once
    // immediately, which is exactly "on init" for free. `originCoords`
    // deliberately does NOT also gate this (see `ListingsEffects.loadMapPins$`,
    // which reads it fresh via `withLatestFrom` at dispatch time regardless)
    // — mirrors the existing catalogue list, whose own `loadListings()`
    // dispatch (`ListingsPageComponent`) reacts only to query-param/filter
    // changes the same way.
    const filters = this.store.selectSignal(selectListingsFilters);
    effect(() => {
      filters();
      this.dispatchInitialFetch();
    });

    // Viewport-driven refetch, debounced — never auto-fits (see the class
    // doc comment). `ListingsEffects.loadMapPins$` itself `switchMap`s, so a
    // still-in-flight stale viewport request is cancelled by a newer one.
    this.viewportChanges$
      .pipe(debounceTime(VIEWPORT_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe((bounds) => this.dispatchViewportFetch(bounds));

    // Detects "a fetch just resolved" (loading true -> false) without RxJS —
    // `awaitingInitialFit` at THAT instant tells us whether it's safe to
    // pulse `fitPinsPulse`. Plain field + effect (not `pairwise()`) to stay
    // in this component's otherwise all-Signals style. `autoFit` gates only
    // the PULSE, not the bookkeeping reset — see `autoFit`'s own doc
    // comment for why a listing-detail map never auto-fits to the fetched
    // pins.
    effect(() => {
      const isLoading = this.loading();
      if (this.wasLoading && !isLoading && this.awaitingInitialFit) {
        this.awaitingInitialFit = false;
        if (this.autoFit()) this.pulseFit();
      }
      this.wasLoading = isLoading;
    });

    // Detail-page "frame me and the toy" pulse — see `fitAnchorPulse`'s own
    // doc comment for why this mirrors `fitPinsPulse`'s one-microtask
    // discipline rather than a persistent binding.
    effect(() => {
      const known = this.userPin();
      if (!this.autoFit() && known !== null) {
        this.fitAnchorPulse.set(true);
        queueMicrotask(() => this.fitAnchorPulse.set(false));
      }
    });
  }

  private dispatchInitialFetch(): void {
    this.awaitingInitialFit = true;
    this.lastBounds = null;
    this.store.dispatch(ListingsActions.loadMapPins({ bounds: null, scope: this.scope() }));
  }

  private dispatchViewportFetch(bounds: MapPinsBounds): void {
    this.awaitingInitialFit = false;
    this.lastBounds = bounds;
    this.store.dispatch(ListingsActions.loadMapPins({ bounds, scope: this.scope() }));
  }

  private pulseFit(): void {
    this.fitPinsPulse.set(true);
    // Reset on the next microtask — `MapComponent`'s own `fitPins`-reactive
    // effect re-runs `syncFitBounds()` on EVERY `markers`/`fitPins` change,
    // so leaving this `true` would re-fit on the NEXT (possibly
    // viewport-driven) `markers` update too. See the class doc comment.
    queueMicrotask(() => this.fitPinsPulse.set(false));
  }

  protected onViewportChanged(bounds: MapBounds): void {
    this.viewportChanges$.next(bounds);
  }

  protected retry(): void {
    if (this.lastBounds === null) this.awaitingInitialFit = true;
    this.store.dispatch(
      ListingsActions.loadMapPins({ bounds: this.lastBounds, scope: this.scope() }),
    );
  }

  protected onMarkerHovered(anchor: MapMarkerAnchor | null): void {
    if (anchor === null) {
      if (this.pinned()) return; // pinned popups only close via Esc/close button/background click
      this.scheduleClose();
      return;
    }

    this.cancelCloseTimer();

    if (this.openKey() === anchor.key) {
      // Same group already open/tracked (hover continuing, or the anchor
      // being kept glued during a pan/zoom) — just update its position.
      this.anchor.set(anchor);
      return;
    }

    if (this.pinned()) return; // see `pinned`'s own doc comment

    this.captureFocusTrigger();
    this.openKey.set(anchor.key);
    this.anchor.set(anchor);
  }

  protected onMarkerActivated(key: string): void {
    this.cancelCloseTimer();
    this.captureFocusTrigger();
    this.pinned.set(true);
    this.openKey.set(key);
    // The anchor itself arrives via the SAME `(markerHovered)` binding —
    // `MapComponent` emits it alongside `markerActivated` for exactly this
    // reason (click/keyboard activation has no preceding hover to have
    // supplied one already) — so nothing else is needed here.
  }

  protected onMapClicked(): void {
    if (this.pinned()) this.closePopup();
  }

  protected onPopupMouseEnter(): void {
    this.cancelCloseTimer();
  }

  protected onPopupMouseLeave(): void {
    if (this.pinned()) return;
    this.scheduleClose();
  }

  protected onEscape(): void {
    if (this.openKey() === null) return;
    const trigger = this.lastFocusedTrigger;
    this.closePopup();
    trigger?.focus();
  }

  protected closePopup(): void {
    this.cancelCloseTimer();
    this.openKey.set(null);
    this.anchor.set(null);
    this.pinned.set(false);
    this.lastFocusedTrigger = null;
  }

  private captureFocusTrigger(): void {
    this.lastFocusedTrigger =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  private scheduleClose(): void {
    this.cancelCloseTimer();
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.closePopup();
    }, POPUP_CLOSE_GRACE_MS);
  }

  private cancelCloseTimer(): void {
    if (this.closeTimer !== null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }
}
