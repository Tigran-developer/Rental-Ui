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
import { ListingsMapComponent } from '../listings-map/listings-map.component';
import { LocationPickerComponent } from '../location-picker/location-picker.component';
import { GeolocationService } from '../../../../shared/services/geolocation.service';
import { LanguageService } from '../../../../shared/services/language.service';
import { haversineDistanceKm } from '../../../../shared/utils/haversine-distance.utils';
import type { MapLatLng } from '../../../../shared/ui/map/map.component';
import { APPROXIMATE_AREA_RADIUS_METERS } from '../../models/approximate-area.const';
import { districtDisplayName } from '../../models/district-ui.util';
import type { ListingDistrict } from '../../models/district.model';
import {
  formatDistanceMeters,
  kmToMeters,
  localeTagForLanguage,
} from '../../models/radius-scale.util';

/** City-level framing zoom — close enough to read the circle, not so close
 *  that the fuzz radius reads as "the house". Shared with the Screen 2
 *  full-screen map so the two views feel like the same place, not two
 *  different zoom levels of it. */
const DETAIL_MAP_ZOOM = 15;

/**
 * Above this confidence radius (metres), a geolocation fix reads as
 * WiFi/IP-level rather than GPS — `GeolocationService` now asks for
 * `enableHighAccuracy: true` (see its own doc comment for the fix that
 * replaced), but a device with no GPS radio, or one indoors with a poor
 * signal, can still legitimately answer with a rough estimate. The listing's
 * OWN uncertainty circle (`APPROXIMATE_AREA_RADIUS_METERS`, above) is ~100m —
 * a visitor fix with a wider error margin than that already makes any
 * distance figure printed from it close to meaningless, so 500m (several
 * times that radius) is where this component stops presenting the fix as
 * trustworthy and offers the manual picker instead, without hiding the
 * (still shown) distance line outright.
 */
const LOW_ACCURACY_THRESHOLD_METERS = 500;

/**
 * The "My location" affordance's state machine. `denied` covers every
 * `GeolocationService` rejection uniformly — permission denied, position
 * unavailable, timeout, or the API being unsupported at all — because the
 * approved design has exactly one soft-fallback treatment ("Pick a point on
 * the map" instead of a red error) for all of them; distinguishing the
 * rejection reason would need copy the design never specified. A LOW-accuracy
 * *success* is a different case entirely — see `lowAccuracy`/`userPinSource`
 * below — and stays `granted`, never `denied`: the browser DID answer, just
 * with a wide confidence radius, which the UI discloses rather than treating
 * as a failure.
 */
type GeoRequestState = 'idle' | 'locating' | 'granted' | 'denied';

/** Which flow produced the current `userPin` — a real `navigator.geolocation`
 *  fix (`'geo'`, carries `userAccuracyMeters`) or a point the visitor placed
 *  themselves in `LocationPickerComponent` (`'manual'`, exact by
 *  construction — a manual pick can never be "low accuracy", so
 *  `lowAccuracy` below is gated on this being `'geo'`). `null` before any
 *  point exists. */
type UserPinSource = 'geo' | 'manual' | null;

/**
 * Listing-detail location block (Maps P1-8 originally; rebuilt for the
 * "location + radius" design, Screens 1 & 2).
 *
 * Always shows the district + city as text. When the listing has a
 * coordinate and the map hasn't failed, renders an INTERACTIVE
 * `app-listings-map` (pan + zoom) gated by `scrollGate` — this page must
 * never lose the page scroll gesture to a map the visitor is just glancing
 * at — plus:
 * - EVERY OTHER approved listing on the same catalogue-style map, exactly
 *   like `/listings?view=map` — `scope="all"` bypasses whatever filter the
 *   visitor last ran there, and `activeListingId` (fed `listingId()`) marks
 *   THIS listing's own marker with a permanent bounce among the others (see
 *   `ListingsMapComponent.scope`/`.activeListingId` and
 *   `MapComponent.highlightedMarkerKey`). The listing's own coordinate is
 *   passed as `anchorPin` (a `fitBounds()` anchor only, `showPin=false` on
 *   the wrapped `app-map` — it already appears as one of the fetched
 *   markers, so a second orange teardrop at the same spot would double up);
 * - a warm "approximate area / ~100 m" pill (design decision: not a red/alert
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
 * string and the two dots on the map convey position. The SAME invariant
 * applies to `userAccuracyMeters` — the browser's own confidence radius for a
 * geolocation fix — which lives in memory only, alongside the coordinate it
 * describes, and is likewise never persisted or sent anywhere.
 *
 * **Low-accuracy disclosure.** `GeolocationService` now asks for a
 * high-accuracy fix (see that service's own doc comment for the WiFi/IP-level
 * confidently-wrong-pin bug this replaced), but a resolved fix can still carry
 * a wide confidence radius — no GPS radio, poor signal, a browser that only
 * ever answers from network triangulation. This component tracks BOTH the
 * coordinate's SOURCE (`userPinSource`: `'geo'` vs `'manual'`) and its
 * accuracy (`userAccuracyMeters`) so it can tell "the visitor typed/dropped an
 * exact point" from "the browser guessed, and guessed loosely" — a manual
 * pick is precise by construction and must never trigger the low-accuracy
 * warning, no matter what `userAccuracyMeters` was left over from an earlier
 * geolocation attempt (`onManualPickConfirmed()` explicitly clears it).
 * `lowAccuracy` (source `'geo'` AND accuracy unknown or over
 * `LOW_ACCURACY_THRESHOLD_METERS`) does NOT hide the distance line — a rough
 * distance is still better than none — but surfaces a soft, non-alert block
 * (design decision #5's calm register, reusing the exact same
 * `.listing-location__geo-denied`/`.listing-location__pick-btn` treatment the
 * `denied` state already uses) offering the manual picker as a precise
 * alternative. The map itself always draws the honest accuracy circle
 * (`app-listings-map`'s own `userAccuracyMeters` pass-through to the wrapped
 * `app-map`) whenever one is known, independent of whether the soft warning
 * is showing.
 *
 * Degradation: if the wrapped `app-map` reports `mapError` (re-emitted
 * through `app-listings-map`'s own `mapError` output), this falls back to a
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
    ListingsMapComponent,
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

  /** Fed to `app-listings-map`'s `[activeListingId]` so THIS listing's own
   *  marker gets the continuous "this is your toy" bounce among all the
   *  others the map now shows — see `ListingsMapComponent.activeListingId`'s
   *  own doc comment. */
  readonly listingId = input.required<string>();
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
  /** Which flow produced `userPin` — see `UserPinSource`'s doc comment. */
  protected readonly userPinSource = signal<UserPinSource>(null);
  /** The browser's own confidence radius (metres) for the CURRENT `userPin`,
   *  when it came from geolocation — see `GeolocationService`'s
   *  `GeolocatedPoint.accuracyMeters` doc comment. `null` for a manual pick
   *  (exact by construction — `onManualPickConfirmed()` always clears this)
   *  or before any point exists. */
  protected readonly userAccuracyMeters = signal<number | null>(null);

  /** See the class doc comment's "Low-accuracy disclosure" section. A manual
   *  pick (`userPinSource() === 'manual'`) can never be low-accuracy — it is
   *  exact by construction — regardless of what `userAccuracyMeters` happens
   *  to hold from an earlier attempt. */
  protected readonly lowAccuracy = computed<boolean>(() => {
    if (this.userPinSource() !== 'geo') return false;
    const accuracy = this.userAccuracyMeters();
    return accuracy === null || accuracy > LOW_ACCURACY_THRESHOLD_METERS;
  });

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

  /** Formatted (unit included) rendering of `userAccuracyMeters` — reuses the
   *  SAME formatter/locale convention `distanceDisplay` above uses (never a
   *  second, divergent distance-display convention for this feature — see
   *  that computed's own doc comment). `null` whenever no accuracy figure is
   *  known: no `userPin` yet, a manual pick (always `null`), or a geolocation
   *  fix that itself came back with `accuracyMeters: null`. */
  protected readonly accuracyDisplay = computed<string | null>(() => {
    const accuracy = this.userAccuracyMeters();
    if (accuracy === null) return null;
    return formatDistanceMeters(
      accuracy,
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
   *  rather than surfacing the raw browser error. On success, records BOTH
   *  the coordinate and the browser's own confidence radius
   *  (`GeolocatedPoint.accuracyMeters`) — never just the former — and marks
   *  the source `'geo'` so `lowAccuracy` can react to it. */
  protected async requestMyLocation(): Promise<void> {
    this.geoState.set('locating');
    try {
      const point = await this.geolocationService.getCurrentPosition();
      this.userPin.set({ lat: point.lat, lng: point.lng });
      this.userPinSource.set('geo');
      this.userAccuracyMeters.set(point.accuracyMeters);
      this.geoState.set('granted');
    } catch {
      this.geoState.set('denied');
    }
  }

  protected openManualPicker(): void {
    this.showPointPicker.set(true);
  }

  /** A manually-placed point is exact by construction — always marks the
   *  source `'manual'` and clears `userAccuracyMeters` (never left over from
   *  an earlier geolocation attempt), so `lowAccuracy` immediately reads
   *  `false` and both the soft warning and the accuracy circle disappear. */
  protected onManualPickConfirmed(point: MapLatLng): void {
    this.userPin.set(point);
    this.userPinSource.set('manual');
    this.userAccuracyMeters.set(null);
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
