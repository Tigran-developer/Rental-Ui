import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  ViewEncapsulation,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DialogModule } from 'primeng/dialog';

import { ListingsMapComponent } from '../listings-map/listings-map.component';
import type { MapLatLng } from '../../../../shared/ui/map/map.component';

/**
 * Full-viewport map (Maps "location + radius" design, Screen 2) — opened by
 * `ListingLocationComponent`'s "expand" button. A larger, purely presentational
 * sibling of the card map on the listing-detail page: same `app-listings-map`
 * reuse (`scope="all"`, `activeListingId` bouncing THIS listing among every
 * other one shown — see `ListingLocationComponent`'s own doc comment), same
 * uncertainty circle, same optional visitor `userPin`, just filling the whole
 * viewport with its own zoom/locate controls and a bottom "plaque" summarising
 * the listing (thumbnail, title, district, distance) with a way back.
 *
 * Ownership split, deliberately: `ListingLocationComponent` is the ONLY place
 * that talks to `GeolocationService` or holds `userPin`/`geoState` — this
 * component only renders whatever it's given and re-emits `(locateMe)` so the
 * SAME geolocation flow (including the "pick a point" fallback dialog) runs
 * regardless of which map surface the visitor clicked the button on. That
 * keeps exactly one state machine for "where is the visitor", instead of two
 * maps independently racing `navigator.geolocation`.
 *
 * Built on PrimeNG's `p-dialog` (`modal`, default `focusTrap`/`closeOnEscape`),
 * the same primitive `LocationPickerComponent` (this feature's own "pick a
 * point" fallback dialog uses the very same shared component too) uses, but
 * with `showHeader=false` (this screen has no header bar — a custom
 * top-left close button and the zone pill sit directly over the map instead)
 * and `closable=false` (no default header close icon to suppress). Because
 * there is no visible header, the accessible name comes from a
 * visually-hidden heading (`#listingLocationMapHeading`) wired via
 * `ariaLabelledBy`, rather than PrimeNG's own `[header]` input; the dialog's
 * `role="dialog"` itself comes from PrimeNG's own `Dialog.role` input
 * (defaults to `'dialog'`, applied to the real rendered container) — it must
 * NOT also be hardcoded as a static `role="dialog"` attribute on the
 * `<p-dialog>` tag in the template, because `appendTo="body"` portals the
 * real dialog content elsewhere on open, leaving that host tag behind
 * PERMANENTLY (open or closed) as an empty phantom `[role="dialog"]` landmark
 * for assistive tech. (Fixed bug, not a hypothetical — this exact thing
 * shipped once; see the template for the removal.)
 *
 * `closable=false` also silently disables PrimeNG's own `closeOnEscape`
 * handling — `Dialog.bindGlobalListeners()` only binds its document Escape
 * listener when `closeOnEscape` AND `closable` are both true. Escape is
 * therefore handled by this component's own `@HostListener` below, gated on
 * `open()`, instead of relying on PrimeNG's gated internal listener. (Same
 * trap, same fix, as `ListingGalleryComponent`'s lightbox dialog.)
 *
 * Focus handling: THIS component does not itself move focus anywhere — Escape
 * and the close button both just emit `(closed)`; returning focus to the
 * "expand" trigger that opened this is `ListingLocationComponent`'s job (see
 * its `closeExpanded()`), exactly like `LocationPickerComponent`'s doc comment
 * says for its own confirm/cancel outputs. This split keeps the one place
 * that had a real focus-return bug before (a trigger button that gets
 * swapped out from under a same-tick `.focus()` call, fixed in commit
 * `897bbd4`) as the one place responsible for getting it right, instead of
 * spreading focus-management across two components.
 *
 * MapTiler's attribution control and logo (rendered inside `app-map` itself,
 * bottom-right / bottom-left respectively) must stay visible and un-obscured
 * — a licence requirement, not decoration. The bottom plaque is inset from
 * both edges and sits well clear of that strip (see the component's own
 * stylesheet for the exact clearance) rather than stretching edge-to-edge.
 */
@Component({
  selector: 'app-listing-location-map',
  standalone: true,
  imports: [DialogModule, ListingsMapComponent, TranslatePipe],
  templateUrl: './listing-location-map.component.html',
  styleUrl: './listing-location-map.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `appendTo="body"` (implicit default is `false`/local, but this dialog
  // always renders — see the template) portals the dialog outside this
  // component's own DOM subtree, so Angular's emulated `_ngcontent` scoping
  // attribute never reaches it — same reasoning as
  // `location-picker.component.ts`.
  encapsulation: ViewEncapsulation.None,
})
export class ListingLocationMapComponent {
  readonly open = input.required<boolean>();
  /** Fed to `app-listings-map`'s `[activeListingId]` — see
   *  `ListingLocationComponent.listingId`'s own doc comment, which this
   *  mirrors verbatim for the full-screen surface. */
  readonly listingId = input.required<string>();
  readonly center = input.required<MapLatLng>();
  readonly circleRadiusMeters = input.required<number>();
  readonly zoom = input<number>(15);
  readonly userPin = input<MapLatLng | null>(null);
  /** The browser's own confidence radius (metres) for `userPin`, forwarded
   *  straight to this screen's own `app-map` — see `MapComponent`'s
   *  `userAccuracyMeters` doc comment. `ListingLocationComponent` is still the
   *  ONLY place that computes/holds this (same ownership split as `userPin`
   *  itself, per the class doc comment); this component just renders it. */
  readonly userAccuracyMeters = input<number | null>(null);
  /** Pre-formatted (already localized/rounded) distance string for
   *  interpolation into the `distanceFromYou` translation key — computed
   *  once by `ListingLocationComponent` so both map surfaces show the exact
   *  same number, never recomputed here. `null` while no visitor point is
   *  known. */
  readonly distanceDisplay = input<string | null>(null);
  readonly title = input.required<string>();
  readonly imageUrl = input<string | null>(null);
  /** "{District}, {City}" — see `ListingLocationComponent.placeLabel`. */
  readonly placeLabel = input.required<string>();

  /** Re-runs the SAME geolocation flow the card map's button does — see the
   *  class doc comment for why this component never calls
   *  `GeolocationService` itself. */
  readonly locateMe = output<void>();
  /** Fired by the close button, Escape, or the "back to listing" button —
   *  all three mean "return to the listing page". */
  readonly closed = output<void>();

  /** This full-screen map is its OWN `app-map` instance (a separate Leaflet
   *  map from the card's), so it can fail independently — e.g. the card
   *  rendered fine before the visitor expanded it, but the tile host went
   *  down in between. */
  protected readonly mapFailed = signal(false);

  protected readonly hasUserPin = computed(() => this.userPin() !== null);

  protected onMapError(): void {
    this.mapFailed.set(true);
  }

  /** Wired to `p-dialog`'s `(visibleChange)` — fires on mask-dismiss (should
   *  this dialog ever set `dismissableMask`; currently `false`) or any other
   *  path that flips PrimeNG's own `visible` state; maps to the same
   *  `(closed)` output the explicit close/back buttons and the Escape
   *  handler below use. */
  protected onVisibleChange(visible: boolean): void {
    if (!visible) {
      this.closed.emit();
    }
  }

  /** Own Escape handling, independent of PrimeNG's `closeOnEscape` — see the
   *  class doc comment for why `closable=false` defeats PrimeNG's gated
   *  internal listener. Bound at `window` (not on `<p-dialog>`) because
   *  `appendTo="body"` portals the real dialog content outside this
   *  component's own DOM subtree, same reasoning as
   *  `ListingGalleryComponent.onWindowKeydown()`. Guarded on `open()` so it's
   *  a no-op while this dialog isn't the one showing. */
  @HostListener('window:keydown', ['$event'])
  protected onWindowKeydown(event: KeyboardEvent): void {
    if (!this.open()) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  protected close(): void {
    this.closed.emit();
  }
}
