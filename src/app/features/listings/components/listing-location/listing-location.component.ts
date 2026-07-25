import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ListingLocationMapComponent } from '../listing-location-map/listing-location-map.component';
import { LocationPickerComponent } from '../location-picker/location-picker.component';
import { GeolocationService } from '../../../../shared/services/geolocation.service';
import { LanguageService } from '../../../../shared/services/language.service';
import { haversineDistanceKm } from '../../../../shared/utils/haversine-distance.utils';
import { MapComponent } from '../../../../shared/ui/map/map.component';
import type { MapLatLng } from '../../../../shared/ui/map/map.component';
import { districtDisplayName } from '../../models/district-ui.util';
import type { ListingDistrict } from '../../models/district.model';
import {
  formatDistanceMeters,
  kmToMeters,
  localeTagForLanguage,
} from '../../models/radius-scale.util';

/**
 * Honest uncertainty radius (metres) drawn around a fuzzed listing pin.
 *
 * The backend snaps non-owner coordinates to the centroid of a geohash-**7**
 * cell — measured at ~117m (E-W) x 153m (N-S) at Yerevan's latitude (bumped
 * from precision 6 to 7 on 2026-07-25; the old geohash-6 cell was ~933m x
 * 611m — see `GeohashSnapper.Precision` in rental-api and the
 * `2026-07-25-geohash-precision-and-radius-circle` feature note). The
 * worst-case distance from that centroid to any point still inside the cell
 * is half the cell's diagonal — the true minimum a circle can be without
 * lying about precision:
 *
 *   sqrt((117/2)^2 + (153/2)^2) ≈ 96.3m
 *
 * 150m is used instead of that bare 96.3m minimum for two independent
 * reasons that happen to agree: it is the exact figure the approved design's
 * pill shows on every screen state ("~150 m"), and it keeps a comfortable
 * margin over the measured worst case — wider, proportionally, than the
 * previous geohash-6-era value's own margin (600m against a ~557.6m
 * half-diagonal). Never draw a radius smaller than the real uncertainty, or
 * the map implies more precision than we actually have — the exact failure
 * this feature exists to prevent.
 */
export const APPROXIMATE_AREA_RADIUS_METERS = 150;

/** City-level framing zoom — close enough to read the circle, not so close
 *  that the fuzz radius reads as "the house". Shared with the Screen 2
 *  full-screen map so the two views feel like the same place, not two
 *  different zoom levels of it. */
const DETAIL_MAP_ZOOM = 15;

/**
 * The "My location" affordance's state machine. `denied` covers every
 * `GeolocationService` rejection uniformly — permission denied, position
 * unavailable, timeout, or the API being unsupported at all — because the
 * approved design has exactly one soft-fallback treatment ("Pick a point on
 * the map" instead of a red error) for all of them; distinguishing the
 * rejection reason would need copy the design never specified.
 */
type GeoRequestState = 'idle' | 'locating' | 'granted' | 'denied';

/**
 * Listing-detail location block (Maps P1-8 originally; rebuilt for the
 * "location + radius" design, Screens 1 & 2).
 *
 * Always shows the district + city as text. When the listing has a
 * coordinate and the map hasn't failed, renders an INTERACTIVE `app-map`
 * (pan + zoom) gated by `scrollGate` — this page must never lose the page
 * scroll gesture to a map the visitor is just glancing at — plus:
 * - a warm "approximate area / ~150 m" pill (design decision: not a red/alert
 *   treatment — this is normal, expected behaviour, not a warning);
 * - a "My location" button that requests `navigator.geolocation` (via the
 *   injected `GeolocationService`, never read from `navigator` directly here)
 *   and, on success, shows a second (blue) pin plus a client-computed
 *   "≈X km from you" line — see `haversineDistanceKm()`, using the exact same
 *   formula `ListingsQueryService` (rental-api) uses server-side so the two
 *   can never disagree;
 * - on ANY geolocation failure, a soft (non-error-styled) block offering
 *   "Pick a point on the map" instead — opens `LocationPickerComponent`
 *   (`features/listings/components/location-picker`), the SAME full-screen
 *   crosshair picker the create-listing wizard and the catalogue's radius
 *   filter already use, configured here with this feature's own translate
 *   keys (`listings.details.location.pointPicker.*`) via its `headerKey`/
 *   `confirmLabelKey`/`cancelLabelKey`/`privacyNoteKey` inputs. A dedicated
 *   near-duplicate (`ListingLocationPointPickerComponent`) existed here
 *   briefly, solely so this feature and the radius-filter feature (developed
 *   in parallel) never touched the same file at once — now that both have
 *   landed, that reason is gone, so this uses the shared component like
 *   every other caller;
 * - an "expand" button that opens `ListingLocationMapComponent` (Screen 2),
 *   a full-viewport version of the same map.
 *
 * The visitor's own coordinate (`userPin`, from either geolocation or the
 * manual picker) is held ONLY in this component's in-memory signal — never
 * written to the URL, `localStorage`, or any request (Maps P2-3). Numeric
 * coordinates are never rendered to the user; only the derived distance
 * string and the two dots on the map convey position.
 *
 * Degradation: if `app-map` reports `mapError`, this falls back to a
 * two-line text card (title + "the toy is still in {district}" description)
 * — never an empty grey box — and disables the "My location" button (no map
 * means no pins to show, so geolocation has nothing useful to attach to).
 *
 * No coordinates at all (`latitude`/`longitude` null — legal, the pin is
 * optional) means no map affordance at all — just the district/city text.
 */
@Component({
  selector: 'app-listing-location',
  standalone: true,
  imports: [
    MapComponent,
    ListingLocationMapComponent,
    LocationPickerComponent,
    TranslatePipe,
  ],
  templateUrl: './listing-location.component.html',
  styleUrl: './listing-location.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingLocationComponent {
  private readonly languageService = inject(LanguageService);
  private readonly geolocationService = inject(GeolocationService);
  private readonly translate = inject(TranslateService);

  readonly city = input.required<string>();
  readonly district = input<ListingDistrict | null>(null);
  readonly latitude = input<number | null>(null);
  readonly longitude = input<number | null>(null);
  /** For the Screen 2 full-screen map's bottom plaque. */
  readonly title = input.required<string>();
  /** Cover photo for the Screen 2 plaque thumbnail; `null` renders no image. */
  readonly imageUrl = input<string | null>(null);

  protected readonly circleRadiusMeters = APPROXIMATE_AREA_RADIUS_METERS;
  protected readonly mapZoom = DETAIL_MAP_ZOOM;

  /** True if `app-map` reported it could not come up; permanent for this
   *  view — the fallback text + district above are always still available. */
  protected readonly mapFailed = signal(false);

  protected readonly geoState = signal<GeoRequestState>('idle');
  /** The visitor's own coordinate — see the class doc comment's Maps P2-3
   *  note. Set either by `requestMyLocation()` (real geolocation) or
   *  `onManualPickConfirmed()` (the fallback picker); both are treated as
   *  equally valid "I know where I am" signals. */
  protected readonly userPin = signal<MapLatLng | null>(null);
  protected readonly hasUserPin = computed(() => this.userPin() !== null);

  protected readonly showPointPicker = signal(false);
  protected readonly expanded = signal(false);

  /** The "expand" button — stable across the fullscreen map's open/close
   *  cycle (it never sits behind a template `@if`/`@else` that swaps which
   *  node occupies this spot, unlike the wizard's CTA-vs-"Change" swap that
   *  caused the focus-return bug fixed in commit `897bbd4`). A direct
   *  `.focus()` call would already be safe here for that reason, but this
   *  uses the same `afterRenderEffect` + "pending" signal pattern anyway —
   *  cheap insurance against a future template change reintroducing exactly
   *  that race, and consistent with the one already-fixed instance of this
   *  bug elsewhere in the codebase. */
  private readonly expandTriggerRef =
    viewChild<ElementRef<HTMLButtonElement>>('expandTrigger');
  private readonly focusReturnPending = signal(false);

  protected readonly districtName = computed<string | null>(() => {
    const d = this.district();
    return d ? districtDisplayName(d, this.languageService.current().code) : null;
  });

  /** "{District}, {City}" (or just the city, when no district resolved) —
   *  reused for the map-unavailable fallback's `{{place}}` interpolation and
   *  the Screen 2 plaque's meta line, so both read identically to the plain
   *  place text at the top of this component. */
  protected readonly placeLabel = computed<string>(() => {
    const name = this.districtName();
    return name ? `${name}, ${this.city()}` : this.city();
  });

  protected readonly hasCoordinates = computed<boolean>(
    () => typeof this.latitude() === 'number' && typeof this.longitude() === 'number',
  );

  protected readonly pin = computed<MapLatLng | null>(() => {
    const lat = this.latitude();
    const lng = this.longitude();
    return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;
  });

  /** Client-side Haversine distance between the listing's (fuzzed, public)
   *  pin and the visitor's own point — see `haversineDistanceKm()`'s doc
   *  comment for why this must use the exact backend formula. `null` unless
   *  BOTH points are known. */
  protected readonly distanceKm = computed<number | null>(() => {
    const p = this.pin();
    const u = this.userPin();
    return p && u ? haversineDistanceKm(p, u) : null;
  });

  /** Formatted (unit included) for interpolation into `distanceFromYou` —
   *  reuses the SAME locale-aware formatter the radius filter and the
   *  catalogue card's distance badge use (`formatDistanceMeters` in
   *  `radius-scale.util.ts`), so the app has exactly one distance-display
   *  convention ("2,5 км" in `ru`, comma decimal) rather than a second,
   *  en-US-only one living here. Unlike prices (`DramCurrencyPipe`, which is
   *  deliberately locale-INDEPENDENT for cross-language consistency), the
   *  approved design calls for locale-aware distance formatting throughout
   *  this feature — this component is not an exception to that. */
  protected readonly distanceDisplay = computed<string | null>(() => {
    const km = this.distanceKm();
    if (km === null) return null;
    return formatDistanceMeters(
      kmToMeters(km),
      localeTagForLanguage(this.languageService.current().code),
      {
        meters: this.translate.instant('listings.filters.distance.unitMeters'),
        kilometers: this.translate.instant('listings.filters.distance.unitKilometers'),
      },
    );
  });

  constructor() {
    afterRenderEffect(() => {
      if (!this.focusReturnPending()) return;
      this.expandTriggerRef()?.nativeElement.focus();
      this.focusReturnPending.set(false);
    });
  }

  protected onMapError(): void {
    this.mapFailed.set(true);
  }

  /** "My location" button handler — shared by the card map's button and the
   *  Screen 2 full-screen map's own locate button (`(locateMe)` output). On
   *  ANY rejection (see `GeoRequestState`'s doc comment), moves to `denied`
   *  rather than surfacing the raw browser error. */
  protected async requestMyLocation(): Promise<void> {
    this.geoState.set('locating');
    try {
      const point = await this.geolocationService.getCurrentPosition();
      this.userPin.set(point);
      this.geoState.set('granted');
    } catch {
      this.geoState.set('denied');
    }
  }

  protected openManualPicker(): void {
    this.showPointPicker.set(true);
  }

  protected onManualPickConfirmed(point: MapLatLng): void {
    this.userPin.set(point);
    this.geoState.set('granted');
    this.showPointPicker.set(false);
  }

  protected onManualPickCancelled(): void {
    this.showPointPicker.set(false);
  }

  protected openExpanded(): void {
    this.expanded.set(true);
  }

  protected closeExpanded(): void {
    this.expanded.set(false);
    this.focusReturnPending.set(true);
  }
}
