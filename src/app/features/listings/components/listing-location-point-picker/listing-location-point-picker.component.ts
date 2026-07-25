import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DialogModule } from 'primeng/dialog';

import { MapComponent } from '../../../../shared/ui/map/map.component';
import type { MapLatLng } from '../../../../shared/ui/map/map.component';

/** Republic Square, Yerevan — same city-centre default `LocationPickerComponent`
 *  (`features/listings/components/location-picker`) uses, kept here as a LOCAL
 *  literal rather than an import from that file — see this class's doc comment
 *  for why this component must not depend on that one at all. */
export const YEREVAN_CENTER: MapLatLng = { lat: 40.1776, lng: 44.5126 };
/** City-level framing for the initial view. */
export const DEFAULT_PICKER_ZOOM = 13;

/**
 * Full-screen "drop a pin" picker for a RENTER'S OWN reference point — opened
 * from `ListingLocationComponent`'s geolocation-denied state ("Pick a point on
 * the map", the approved design's Screen 1 `deny` panel) so a visitor who
 * declined the browser's location prompt can still see roughly how far the
 * listing is from them.
 *
 * This is a deliberate near-duplicate of `LocationPickerComponent`
 * (`features/listings/components/location-picker`), NOT a reuse of it, and
 * that duplication is intentional rather than an oversight:
 * - That component is the create-listing wizard's "where is the toy" picker —
 *   a parallel workstream (the catalog radius filter's own reference-point
 *   picker, Maps P2 design Screen 5) is actively extending/reusing it at the
 *   same time this component was written.
 * - The two pickers are mechanically identical (`app-map`'s `crosshair` mode +
 *   a full-screen PrimeNG `p-dialog` + confirm/cancel outputs) but say
 *   different things: the wizard's copy is about PUBLISHING the toy's
 *   location for every visitor to see (fuzzed); this one is about a visitor
 *   PRIVATELY marking roughly where they are, purely to compute an on-screen
 *   distance. That value is read once by `ListingLocationComponent`, used for
 *   a client-side Haversine calculation, and never sent to the server or
 *   written to the URL/`localStorage` (Maps P2-3 — a visitor's own location
 *   must never be persisted).
 * Generalizing the wizard's picker with new inputs to cover both call sites
 * was considered and rejected here specifically to avoid two agents editing
 * the same file in the same window — see the listing-location feature note.
 *
 * A11y: the same primitive `LocationPickerComponent` uses — PrimeNG's
 * `p-dialog` (`modal` + default `focusTrap`/`closeOnEscape`/`focusOnShow`)
 * already provides `role="dialog"`/`aria-modal`/`aria-labelledby`, a keyboard
 * focus trap, and Escape-to-close. Returning focus to whichever trigger
 * opened this dialog is the CALLER's job via `confirmed`/`cancelled` — and the
 * caller must do it with an `afterRenderEffect` (or equivalent), NOT a plain
 * `.focus()` call in the same tick that also flips a template `@if`/`@else`
 * swap: that exact bug (focusing a node Angular was about to destroy) was
 * fixed once already for the wizard's own picker in commit `897bbd4` — see
 * `ListingLocationComponent.closeManualPicker()`'s doc comment for the
 * reapplied fix here.
 */
@Component({
  selector: 'app-listing-location-point-picker',
  standalone: true,
  imports: [DialogModule, MapComponent, TranslatePipe],
  templateUrl: './listing-location-point-picker.component.html',
  styleUrl: './listing-location-point-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `appendTo="body"` portals the dialog outside this component's own DOM
  // subtree, so Angular's emulated `_ngcontent` scoping attribute never
  // reaches it — same reasoning as `location-picker.component.ts`/
  // `auth-dialog.component.ts`.
  encapsulation: ViewEncapsulation.None,
})
export class ListingLocationPointPickerComponent {
  readonly open = input.required<boolean>();
  /** Re-centres on the listing's own approximate area so the visitor's first
   *  view is already roughly in the right place, rather than defaulting to
   *  the city centre every time. */
  readonly initialCenter = input<MapLatLng>(YEREVAN_CENTER);
  readonly initialZoom = input<number>(DEFAULT_PICKER_ZOOM);

  readonly confirmed = output<MapLatLng>();
  readonly cancelled = output<void>();

  /** The coordinate currently under the crosshair — see
   *  `LocationPickerComponent.currentCenter`'s doc comment for why this is
   *  NEVER fed back into `app-map`'s `[center]` input (NG0103 feedback loop);
   *  the same reasoning applies verbatim here. */
  protected readonly currentCenter = signal<MapLatLng>(YEREVAN_CENTER);

  constructor() {
    effect(() => {
      if (this.open()) {
        this.currentCenter.set(this.initialCenter());
      }
    });
  }

  protected onCenterChange(center: MapLatLng): void {
    this.currentCenter.set(center);
  }

  /** Wired to `p-dialog`'s `(visibleChange)` — fires on Escape or the header's
   *  close button; both mean "cancel". */
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
