import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { ImageContainerComponent } from '../../../../shared/ui/image-container/image-container.component';
import { DramCurrencyPipe } from '../../../../shared/utils/dram-currency.pipe';
import type { ListingMapPin } from '../../models/listing-map-pin.model';

/**
 * Maps P2-2: one toy's hover-card content — presentational only, no store
 * access, mounted by `ListingsMapComponent` (sub-step 3) positioned over
 * `app-map`'s `[app-map-overlay]` slot at a `MapMarkerAnchor` pixel
 * coordinate. Deliberately NOT a second `ListingCardComponent`: this is a
 * compact hover card, not a catalogue card, so it renders only what a
 * visitor needs to decide whether to open the listing — image, title,
 * price, rating, a view button.
 *
 * `rating`/`reviewCount` mirror `ListingCardComponent`'s own "no rating yet"
 * treatment byte-for-byte (same translate keys, same markup shape) per the
 * P2-2 plan — `rating` is `null` below the `reviewCount < 2` aggregate
 * threshold, same rule as the catalogue card, so the two must never drift
 * into different copy for the same underlying state.
 *
 * Price is formatted with the SAME `DramCurrencyPipe` every other price
 * render site in this app uses (DoRent is AMD-only — see that pipe's own
 * doc comment), suffixed with the toy's actual `priceUnit` via the
 * `listings.createForm.perUnit.<unit>` keys `CreateListingFormComponent`
 * already established (`/ day`, `/ hour`, …) rather than inventing a
 * second suffix vocabulary — a map pin can publish any `PriceUnit`, unlike
 * `ListingPreview` (always daily in the catalogue card today).
 */
@Component({
  selector: 'app-listings-map-popup',
  standalone: true,
  imports: [DecimalPipe, DramCurrencyPipe, ImageContainerComponent, RouterLink, TranslatePipe],
  templateUrl: './listings-map-popup.component.html',
  styleUrl: './listings-map-popup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingsMapPopupComponent {
  readonly pin = input.required<ListingMapPin>();

  /** Emitted by the card's own close (×) button — the touch/keyboard path
   *  for dismissing a PINNED-open popup (`markerActivated`) needs an
   *  explicit affordance since neither input method has an "Esc" gesture;
   *  `ListingsMapComponent` wires this to the same handler that also
   *  closes on Esc / a map-background click. Harmless to wire per-card even
   *  inside a multi-pin group stack — closing is idempotent. */
  readonly closeRequested = output<void>();

  protected readonly detailsRoute = computed<[string, string]>(() => [
    '/listings',
    this.pin().id,
  ]);

  /** `listings.createForm.perUnit.<unit>` — see the class doc comment for
   *  why this reuses the create-listing wizard's own suffix vocabulary
   *  instead of a second one. */
  protected readonly priceUnitSuffixKey = computed(
    () => `listings.createForm.perUnit.${this.pin().priceUnit.toLowerCase()}`,
  );

  protected onCloseClick(): void {
    this.closeRequested.emit();
  }
}
