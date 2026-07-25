import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  EventEmitter,
  inject,
  input,
  Output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { LanguageService } from '../../../../shared/services/language.service';
import { ImageContainerComponent } from '../../../../shared/ui/image-container/image-container.component';
import { DramCurrencyPipe } from '../../../../shared/utils/dram-currency.pipe';
import type { BookingStatus } from '../../../bookings/models/booking.model';
import type { ListingPreview } from '../../models/listing.model';
import { formatDistanceMeters, kmToMeters, localeTagForLanguage } from '../../models/radius-scale.util';

interface BookingBadgeConfig {
  readonly labelKey: string;
  readonly modifier: 'pending' | 'approved' | 'active' | 'completed' | 'declined';
}

function resolveBookingBadge(status: BookingStatus | null | undefined): BookingBadgeConfig | null {
  switch (status) {
    case 'PendingApproval':
    case 'Pending':
      return { labelKey: 'listings.card.bookingBadge.rentalRequested', modifier: 'pending' };
    case 'Approved':
      return { labelKey: 'listings.card.bookingBadge.approved', modifier: 'approved' };
    case 'Active':
      return { labelKey: 'listings.card.bookingBadge.currentlyRenting', modifier: 'active' };
    case 'ReturnMarked':
      return { labelKey: 'listings.card.bookingBadge.awaitingCompletion', modifier: 'pending' };
    case 'Completed':
      return { labelKey: 'listings.card.bookingBadge.previouslyRented', modifier: 'completed' };
    case 'Rejected':
      return { labelKey: 'listings.card.bookingBadge.requestDeclined', modifier: 'declined' };
    case 'Cancelled':
      return { labelKey: 'listings.card.bookingBadge.cancelled', modifier: 'declined' };
    default:
      return null;
  }
}

interface AgeRangeDisplay {
  readonly key:
    | 'listings.details.toyDetails.ageRangeFromTo'
    | 'listings.details.toyDetails.ageRangeFromOnly'
    | 'listings.details.toyDetails.ageRangeToOnly';
  readonly params: { from?: number; to?: number };
}

function resolveConditionLabelKey(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  switch (normalized) {
    case 'new':
      return 'listings.details.conditionValues.new';
    case 'likenew':
      return 'listings.details.conditionValues.likeNew';
    case 'good':
      return 'listings.details.conditionValues.good';
    case 'fair':
      return 'listings.details.conditionValues.fair';
    default:
      return null;
  }
}

function resolveAgeRangeDisplay(
  fromMonths: number | null | undefined,
  toMonths: number | null | undefined,
): AgeRangeDisplay | null {
  const hasFrom = typeof fromMonths === 'number' && Number.isFinite(fromMonths);
  const hasTo = typeof toMonths === 'number' && Number.isFinite(toMonths);

  if (hasFrom && hasTo) {
    return {
      key: 'listings.details.toyDetails.ageRangeFromTo',
      params: { from: fromMonths, to: toMonths },
    };
  }
  if (hasFrom) {
    return {
      key: 'listings.details.toyDetails.ageRangeFromOnly',
      params: { from: fromMonths },
    };
  }
  if (hasTo) {
    return {
      key: 'listings.details.toyDetails.ageRangeToOnly',
      params: { to: toMonths },
    };
  }
  return null;
}

@Component({
  selector: 'app-listing-card',
  standalone: true,
  imports: [
    DramCurrencyPipe,
    DecimalPipe,
    ImageContainerComponent,
    RouterLink,
    TranslatePipe,
  ],
  templateUrl: './listing-card.component.html',
  styleUrl: './listing-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingCardComponent {
  private readonly languageService = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  readonly listing = input.required<ListingPreview>();
  readonly isAuthenticated = input<boolean>(false);
  readonly bookingStatus = input<BookingStatus | null | undefined>(undefined);
  readonly isOwner = input<boolean>(false);

  @Output() readonly favoriteToggled = new EventEmitter<string>();

  /**
   * `.distbadge` pill (Maps P2 "location + radius" design) — only populated
   * when `GET /api/listings` was called with `originLat`/`originLng`
   * (`ListingPreview.distanceKm`'s own doc comment), so this is `null`/hidden
   * everywhere else (favorites, my-listings, unfiltered browse). Distance is
   * never recomputed client-side — always the backend's haversine value.
   */
  protected readonly distanceLabel = computed(() => {
    const km = this.listing().distanceKm;
    if (km == null) return null;
    return formatDistanceMeters(kmToMeters(km), localeTagForLanguage(this.languageService.current().code), {
      meters: this.translate.instant('listings.filters.distance.unitMeters'),
      kilometers: this.translate.instant('listings.filters.distance.unitKilometers'),
    });
  });

  protected readonly cardLink = computed(() =>
    this.isOwner()
      ? ['/my-listings', this.listing().id]
      : ['/listings', this.listing().id],
  );

  protected readonly bookingBadge = computed(() =>
    this.isAuthenticated() ? resolveBookingBadge(this.bookingStatus()) : null,
  );

  protected readonly ageRange = computed(() => {
    const listing = this.listing();
    return resolveAgeRangeDisplay(listing.ageFromMonths, listing.ageToMonths);
  });

  protected readonly conditionLabelKey = computed(() =>
    resolveConditionLabelKey(this.listing().condition),
  );

  protected readonly hasHygieneNotes = computed(() => {
    const notes = this.listing().hygieneNotes;
    return typeof notes === 'string' && notes.trim().length > 0;
  });

  protected readonly hasCondition = computed(() => {
    const condition = this.listing().condition;
    return typeof condition === 'string' && condition.trim().length > 0;
  });

  // Age is shown in the image overlay; condition + hygiene in the trust footer row.
  protected readonly showTrustFooter = computed(
    () => this.hasCondition() || this.hasHygieneNotes(),
  );

  protected onFavoriteClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.favoriteToggled.emit(this.listing().id);
  }
}
