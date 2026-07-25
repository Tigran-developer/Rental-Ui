import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DialogModule } from 'primeng/dialog';

import { GeolocationService } from '../../../../shared/services/geolocation.service';
import { MapComponent } from '../../../../shared/ui/map/map.component';
import type { MapLatLng } from '../../../../shared/ui/map/map.component';

/** Republic Square, Yerevan — the wizard's default pin location. */
export const YEREVAN_CENTER: MapLatLng = { lat: 40.1776, lng: 44.5126 };
/** City-level framing for the initial view. */
export const DEFAULT_PICKER_ZOOM = 13;

/**
 * Full-screen "drop a pin" picker used by the create-listing wizard's Step 3.
 *
 * Rather than a draggable marker (fiddly on touch), the map itself pans under a
 * fixed centre crosshair (`app-map`'s `crosshair` mode) — confirming just reads
 * off whatever coordinate is currently under the crosshair.
 *
 * A11y: built on PrimeNG's `p-dialog` (`modal` + default `focusTrap`/
 * `closeOnEscape`/`focusOnShow`), which already gives this a proper
 * `role="dialog"`/`aria-modal`/`aria-labelledby`, a keyboard focus trap, and
 * Escape-to-close — the same primitive `auth-dialog` already uses elsewhere in
 * this codebase. Returning focus to the trigger that opened the picker is the
 * caller's job (it owns that button), via the `confirmed`/`cancelled` outputs.
 */
@Component({
  selector: 'app-location-picker',
  standalone: true,
  imports: [DialogModule, MapComponent, TranslatePipe],
  templateUrl: './location-picker.component.html',
  styleUrl: './location-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `appendTo="body"` portals the dialog outside this component's own DOM
  // subtree, so Angular's emulated `_ngcontent` scoping attribute never reaches
  // it — same reasoning as `auth-dialog.component.ts`.
  encapsulation: ViewEncapsulation.None,
})
export class LocationPickerComponent {
  private readonly geolocation = inject(GeolocationService);

  readonly open = input.required<boolean>();
  /** Re-centres on the already-picked pin when re-opening; else Yerevan. */
  readonly initialCenter = input<MapLatLng>(YEREVAN_CENTER);
  readonly initialZoom = input<number>(DEFAULT_PICKER_ZOOM);

  /**
   * Translate keys for the dialog chrome — all default to the wizard's
   * original hardcoded keys, so the create-listing wizard (the original
   * consumer of this component) renders byte-for-byte the same text it
   * always has. `RadiusOriginFilterComponent` (Maps P2 screen 5, a SEPARATE
   * scenario from the wizard's own location step) overrides these to its own
   * "measure distance from here" copy.
   */
  readonly headerKey = input<string>('listings.createForm.locationPicker.title');
  readonly confirmLabelKey = input<string>('listings.createForm.locationPicker.confirm');
  readonly cancelLabelKey = input<string>('listings.createForm.locationPicker.cancel');

  /**
   * Opt-in floating hint card (`.location-picker__hint` — the approved
   * design's `.pickhint`), shown above the crosshair. `null` (default, the
   * wizard's own behaviour) renders nothing extra; the wizard relies on the
   * dialog header alone. `hintSubtitleMovedKey`/`hintSubtitleIdleKey` let the
   * subtitle read differently before vs. after the first pan (screen 5's
   * "map hasn't moved yet" vs. "move the map…") — both fall back to
   * `hintTitleKey`'s own subtitle-less rendering when omitted.
   */
  readonly hintTitleKey = input<string | null>(null);
  readonly hintSubtitleMovedKey = input<string | null>(null);
  readonly hintSubtitleIdleKey = input<string | null>(null);

  /** Opt-in "My location" button docked to the map (`[app-map-actions]`) —
   *  `false` (default) preserves the wizard's map exactly as before. */
  readonly showMyLocationButton = input<boolean>(false);

  /**
   * Opt-in dashed radius-preview circle (screen 5) — CSS-only, sized from
   * `radiusPreviewMeters`/`initialZoom`/the crosshair's current latitude via
   * the standard Web Mercator metres-per-pixel formula, NOT Leaflet's own
   * `circleRadiusMeters` geographic circle layer: that layer requires `pin`
   * and is unconditionally suppressed in `crosshair` mode (see
   * `map.component.ts`'s `syncCircle()` — crosshair mode has no fixed `pin`
   * coordinate to anchor a circle to, by design), and `shared/ui/map/` is out
   * of scope to modify for this feature. The formula uses the zoom the map
   * OPENED at (`initialZoom`) for the whole session rather than tracking live
   * zoom changes — `app-map` has no `zoomChange` output to react to a pinch
   * zoom — so this is an approximation, acceptable for a preview aid rather
   * than a precise measurement. `null` (default) renders no preview.
   */
  readonly radiusPreviewMeters = input<number | null>(null);

  /**
   * When `true`, the footer's confirm button stays disabled until the map
   * has actually panned at least once (screen 5's "Готово" starts
   * grey/disabled until the crosshair has been aimed) — see `hasMoved`
   * below. `false` (default) preserves the wizard's confirm button, which has
   * never required a pan (confirming the default Yerevan-centre pin is valid
   * there).
   */
  readonly confirmDisabledUntilMoved = input<boolean>(false);

  readonly confirmed = output<MapLatLng>();
  readonly cancelled = output<void>();

  /**
   * The coordinate currently under the crosshair — updated as the map pans,
   * read only by `confirm()`. Deliberately NEVER fed back into `app-map`'s
   * `[center]` input (the template binds that to `initialCenter()` instead):
   * doing so closed a feedback loop that hit Angular's NG0103 ("infinite
   * change detection") — pan → `centerChange` → `currentCenter.set()` →
   * `[center]` changes → `app-map`'s own effect calls `setView()` → Leaflet
   * fires `moveend` again → repeat. `initialCenter` only changes when the
   * picker (re)opens, so binding to it is a single, one-shot `setView()` with
   * no way to re-trigger itself.
   */
  protected readonly currentCenter = signal<MapLatLng>(YEREVAN_CENTER);

  /**
   * `true` once the map has genuinely panned at least once since the picker
   * opened — gates `confirmDisabledUntilMoved`. NOT simply "did `centerChange`
   * fire": `map.component.ts`'s crosshair mode emits `centerChange` once
   * immediately on creation (even with zero pan, "a confirm without any pan
   * still needs a coordinate to submit") — so the FIRST emission after
   * opening is that initial report, not a real move, and `receivedFirstCenter`
   * (a plain flag, not a signal — it's write-only bookkeeping the template
   * never reads) distinguishes the two.
   */
  protected readonly hasMoved = signal(false);
  private receivedFirstCenter = false;

  /**
   * One-shot override set by `requestMyLocation()` below. Deliberately a
   * SEPARATE signal from `currentCenter`/`initialCenter` — mirroring this
   * class's own NG0103 warning (see the class doc comment): feeding a live
   * pan position back into `[center]` closes a pan→emit→input-change→
   * `setView()` loop, but `centerOverride` is only ever written by a user
   * button click, never by `onCenterChange`, so binding `[center]` to
   * `mapCenter` (below) below cannot re-trigger itself.
   */
  private readonly centerOverride = signal<MapLatLng | null>(null);

  /** What `app-map`'s `[center]` actually binds to — `initialCenter()` until
   *  (if ever) `requestMyLocation()` overrides it once. */
  protected readonly mapCenter = computed<MapLatLng>(
    () => this.centerOverride() ?? this.initialCenter(),
  );

  constructor() {
    // Reset the crosshair's starting point every time the picker (re-)opens.
    effect(() => {
      if (this.open()) {
        this.currentCenter.set(this.initialCenter());
        this.hasMoved.set(false);
        this.receivedFirstCenter = false;
        this.centerOverride.set(null);
      }
    });
  }

  protected onCenterChange(center: MapLatLng): void {
    this.currentCenter.set(center);
    if (!this.receivedFirstCenter) {
      this.receivedFirstCenter = true;
    } else {
      this.hasMoved.set(true);
    }
  }

  /** Opt-in "My location" button (`showMyLocationButton`) — a ONE-TIME
   *  imperative recentre, not continuous tracking; see `centerOverride`'s
   *  own doc comment for why this can never loop back into itself. */
  protected requestMyLocation(): void {
    this.geolocation.getCurrentPosition().then(
      (coords) => this.centerOverride.set(coords),
      () => {
        /* No dedicated error UI here — the picker's own "My location" button
         * is a convenience shortcut; a denial just leaves the crosshair where
         * it was, same as if the button had never been pressed. The primary
         * denial UX (`RadiusOriginFilterComponent`'s "denied" state, design
         * decision #5) lives one level up, on the button that opened this
         * picker in the first place. */
      },
    );
  }

  /**
   * Pixel diameter for the opt-in dashed radius-preview circle — see
   * `radiusPreviewMeters`'s own doc comment for why this is a CSS
   * approximation rather than a real Leaflet geographic layer. Standard Web
   * Mercator metres-per-pixel at 256px tiles: `156543.03392 * cos(lat) /
   * 2^zoom`. Clamped to a sane pixel range so an extreme zoom/radius
   * combination never renders something absurd relative to the dialog.
   */
  protected readonly previewDiameterPx = computed<number | null>(() => {
    const meters = this.radiusPreviewMeters();
    if (meters === null || meters <= 0) return null;
    const latRad = (this.currentCenter().lat * Math.PI) / 180;
    const metersPerPixel =
      (156543.03392 * Math.cos(latRad)) / Math.pow(2, this.initialZoom());
    if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return null;
    const diameterPx = (2 * meters) / metersPerPixel;
    return Math.min(560, Math.max(24, diameterPx));
  });

  /** Wired to `p-dialog`'s `(visibleChange)` — fires on Escape, the header's
   *  close button, or a future mask click; all three mean "cancel". */
  protected onVisibleChange(visible: boolean): void {
    if (!visible) {
      this.cancelled.emit();
    }
  }

  protected confirm(): void {
    this.confirmed.emit(this.currentCenter());
  }

  protected cancel(): void {
    this.cancelled.emit();
  }
}
