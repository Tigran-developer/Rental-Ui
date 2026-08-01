import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
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

/** Mirrors `listings-map-popup.component.scss`'s own fixed `:host` width —
 *  kept here (not imported — the popup component has no reason to export a
 *  layout constant) so this component's own edge-clamping math agrees with
 *  what actually renders. */
const POPUP_WIDTH_PX = 220;

/** Conservative height estimate used for edge-clamping math, matching this
 *  component's own `.listings-map__popup-stack-body` `max-height` (see the
 *  stylesheet) — a single popup card renders shorter than this, so using the
 *  group-stack cap everywhere is a safe (if occasionally too generous)
 *  upper bound, never an under-estimate that would let a popup overflow the
 *  map's edge. */
const POPUP_MAX_HEIGHT_PX = 320;

/** Mirrors `MapComponent`'s own private `PIN_ICON_SIZE` (the ball icon is a
 *  32×32 box, anchored bottom-centre) — needed here to compute where the
 *  ball's OWN top edge is (`anchor.y - MARKER_ICON_SIZE_PX`), since a
 *  `MapMarkerAnchor` only reports the anchor point (the ball's ground
 *  contact point), not its bounding box. `MapComponent` doesn't expose this
 *  as a public constant today; if its icon size ever changes, this needs
 *  updating alongside it. */
const MARKER_ICON_SIZE_PX = 32;

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

  protected readonly initialCenter: MapLatLng = YEREVAN_CENTER;
  protected readonly initialZoom = DEFAULT_PICKER_ZOOM;
  protected readonly markerRadiusMeters = APPROXIMATE_AREA_RADIUS_METERS;

  protected readonly pins = this.store.selectSignal(selectMapPins);
  protected readonly loading = this.store.selectSignal(selectMapPinsLoading);
  protected readonly error = this.store.selectSignal(selectMapPinsError);
  protected readonly truncated = this.store.selectSignal(selectMapPinsTruncated);

  protected readonly groups = computed<ListingPinGroup[]>(() =>
    groupPinsByCoordinate(this.pins()),
  );
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

  /** Pulsed `true` for one microtask after a `bounds: null` fetch resolves —
   *  see the class doc comment's "`fitPins` discipline" section. */
  protected readonly fitPinsPulse = signal(false);

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
    // in this component's otherwise all-Signals style.
    effect(() => {
      const isLoading = this.loading();
      if (this.wasLoading && !isLoading && this.awaitingInitialFit) {
        this.awaitingInitialFit = false;
        this.pulseFit();
      }
      this.wasLoading = isLoading;
    });
  }

  private dispatchInitialFetch(): void {
    this.awaitingInitialFit = true;
    this.lastBounds = null;
    this.store.dispatch(ListingsActions.loadMapPins({ bounds: null }));
  }

  private dispatchViewportFetch(bounds: MapPinsBounds): void {
    this.awaitingInitialFit = false;
    this.lastBounds = bounds;
    this.store.dispatch(ListingsActions.loadMapPins({ bounds }));
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
    this.store.dispatch(ListingsActions.loadMapPins({ bounds: this.lastBounds }));
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
