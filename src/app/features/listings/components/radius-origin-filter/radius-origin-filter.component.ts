import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';

import { GeolocationService } from '../../../../shared/services/geolocation.service';
import { LanguageService } from '../../../../shared/services/language.service';
import { MapComponent } from '../../../../shared/ui/map/map.component';
import type { MapLatLng } from '../../../../shared/ui/map/map.component';
import {
  formatDistanceMeters,
  localeTagForLanguage,
  metersToSliderValue,
  RADIUS_PRESET_METERS,
  RADIUS_SLIDER_MAX,
  RADIUS_SLIDER_MIN,
  sliderValueToMeters,
} from '../../models/radius-scale.util';
import * as ListingsActions from '../../store/listings.actions';
import {
  selectListingsOriginCoords,
  selectListingsOriginDenied,
  selectListingsOriginSource,
} from '../../store/listings.selectors';
import { LocationPickerComponent, YEREVAN_CENTER } from '../location-picker/location-picker.component';

/** Default radius (metres) auto-selected the moment an origin becomes set
 *  with no radius chosen yet — matches the approved design mockup's own
 *  default preset ("1 km") so unlocking the slider always shows a working
 *  value instead of a dead 200 m floor. */
const DEFAULT_RADIUS_METERS = 1000;

/** Slider-scale tolerance for "is this preset the active one" — mirrors the
 *  approved design mockup's own `<25` highlight threshold (on the same
 *  0–1000 slider scale), converted here via `metersToSliderValue` rather
 *  than compared in raw metres (which would need a different tolerance per
 *  step size). */
const PRESET_ACTIVE_TOLERANCE = 25;

export type RadiusOriginState = 'unset' | 'geo' | 'manual' | 'denied';

/**
 * Shared "reference point + search radius" filter control (Maps P2
 * "location + radius" design, screens 3–5) — the single source of markup and
 * behaviour used by BOTH the desktop sidebar (`ListingsPageComponent`) and
 * the mobile bottom sheet (`ListingsFiltersComponent`), so the two surfaces
 * can never drift apart the way `districtIds` deliberately doesn't either.
 *
 * Owns the origin (geolocation / manual-pick / denied) UI and dispatch
 * directly — via the shared `ListingsState.originCoords`/`originSource`/
 * `originDenied` slice, session-only and never part of the URL (Maps P2-3) —
 * since that behaviour is byte-for-byte identical on both surfaces. The
 * RADIUS value itself is fully controlled by the parent (`radiusMeters`
 * in / `radiusMetersChange` out) because the two surfaces commit it
 * differently: the desktop sidebar applies immediately (merge-navigates on
 * every change, like every other sidebar control); the mobile sheet stages
 * it in a draft until "Show N" is tapped (like every other sheet field) —
 * see `listings-filters.component.ts`'s M-021 doc comment for why that
 * component is careful about which fields it owns and how it commits them.
 */
@Component({
  selector: 'app-radius-origin-filter',
  standalone: true,
  imports: [LocationPickerComponent, MapComponent, TranslatePipe],
  templateUrl: './radius-origin-filter.component.html',
  styleUrl: './radius-origin-filter.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RadiusOriginFilterComponent {
  private readonly store = inject(Store);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly geolocation = inject(GeolocationService);

  /** Controlled radius value in METRES, or `null` when no radius is chosen
   *  yet (always the case while `locked()`). Meters, not km, purely because
   *  the slider math (`radius-scale.util.ts`) is metre-based — parents that
   *  store the filter in km (`ListingsFilter.radiusKm`) convert at their own
   *  boundary via `metersToKm`/`kmToMeters`. */
  readonly radiusMeters = input<number | null>(null);
  readonly radiusMetersChange = output<number>();

  protected readonly originCoords = this.store.selectSignal(selectListingsOriginCoords);
  protected readonly originSource = this.store.selectSignal(selectListingsOriginSource);
  protected readonly originDenied = this.store.selectSignal(selectListingsOriginDenied);

  protected readonly originState = computed((): RadiusOriginState => {
    if (this.originCoords() !== null) {
      return this.originSource() === 'manual' ? 'manual' : 'geo';
    }
    return this.originDenied() ? 'denied' : 'unset';
  });

  protected readonly locked = computed(() => this.originCoords() === null);

  protected readonly pickerOpen = signal(false);
  protected readonly pickerInitialCenter = computed<MapLatLng>(
    () => this.originCoords() ?? YEREVAN_CENTER,
  );

  // Instant visual feedback while dragging — committed only on `change`
  // (pointer/key release) or a preset click, so navigating doesn't fire on
  // every pixel of drag (see `onSliderInput` vs `onSliderCommit` below).
  private readonly liveSliderValue = signal<number | null>(null);

  private readonly committedSliderValue = computed(() =>
    metersToSliderValue(this.radiusMeters() ?? DEFAULT_RADIUS_METERS),
  );

  protected readonly effectiveSliderValue = computed(
    () => this.liveSliderValue() ?? this.committedSliderValue(),
  );

  protected readonly effectiveMeters = computed(() =>
    sliderValueToMeters(this.effectiveSliderValue()),
  );

  protected readonly localeTag = computed(() =>
    localeTagForLanguage(this.languageService.current().code),
  );

  protected readonly formattedRadius = computed(() =>
    formatDistanceMeters(this.effectiveMeters(), this.localeTag(), {
      meters: this.translate.instant('listings.filters.distance.unitMeters'),
      kilometers: this.translate.instant('listings.filters.distance.unitKilometers'),
    }),
  );

  protected readonly sliderMin = RADIUS_SLIDER_MIN;
  protected readonly sliderMax = RADIUS_SLIDER_MAX;
  protected readonly presets = RADIUS_PRESET_METERS;

  // Guards the auto-default-on-origin-set below so it fires at most once per
  // "origin just became set" transition, even if a parent were slow to echo
  // the emitted value back into `radiusMeters` — see the field's own comment.
  private defaultRequested = false;

  constructor() {
    // Design decision #4: once an origin becomes available, the radius
    // slider unlocks already showing a usable value (matches the approved
    // mockup's geo/manual/applied panels, all of which show a preset
    // already selected) instead of an unlocked-but-still-empty control.
    effect(() => {
      const hasOrigin = this.originCoords() !== null;
      if (!hasOrigin) {
        this.defaultRequested = false;
        return;
      }
      if (this.radiusMeters() === null && !this.defaultRequested) {
        this.defaultRequested = true;
        this.radiusMetersChange.emit(DEFAULT_RADIUS_METERS);
      }
    });
  }

  protected formatPreset(meters: number): string {
    return formatDistanceMeters(meters, this.localeTag(), {
      meters: this.translate.instant('listings.filters.distance.unitMeters'),
      kilometers: this.translate.instant('listings.filters.distance.unitKilometers'),
    });
  }

  protected isPresetActive(meters: number): boolean {
    return (
      Math.abs(metersToSliderValue(meters) - this.effectiveSliderValue()) <
      PRESET_ACTIVE_TOLERANCE
    );
  }

  protected selectPreset(meters: number): void {
    this.liveSliderValue.set(null);
    this.radiusMetersChange.emit(meters);
  }

  protected onSliderInput(event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    this.liveSliderValue.set(raw);
  }

  protected onSliderCommit(event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    const meters = sliderValueToMeters(raw);
    this.liveSliderValue.set(null);
    this.radiusMetersChange.emit(meters);
  }

  protected requestGeolocation(): void {
    this.geolocation.getCurrentPosition().then(
      (coords) => {
        this.store.dispatch(ListingsActions.setOriginCoords({ coords, source: 'geo' }));
      },
      () => {
        this.store.dispatch(ListingsActions.setOriginDenied());
        this.showGeolocationError();
      },
    );
  }

  protected openPicker(): void {
    this.pickerOpen.set(true);
  }

  protected onPickerCancelled(): void {
    this.pickerOpen.set(false);
  }

  protected onPickerConfirmed(center: MapLatLng): void {
    this.pickerOpen.set(false);
    this.store.dispatch(
      ListingsActions.setOriginCoords({ coords: center, source: 'manual' }),
    );
  }

  private showGeolocationError(): void {
    this.messageService.add({
      severity: 'warn',
      summary: this.translate.instant('listings.page.geolocationErrorTitle'),
      detail: this.translate.instant('listings.page.geolocationErrorDetail'),
    });
  }
}
