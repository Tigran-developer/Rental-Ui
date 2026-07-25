import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Store, createSelector } from '@ngrx/store';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { combineLatest, distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { AuthDialogComponent } from '../../../auth/components/auth-dialog/auth-dialog.component';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header.component';
import { DramCurrencyPipe } from '../../../../shared/utils/dram-currency.pipe';
import { selectAuthUser, selectIsAuthenticated } from '../../../auth/store/auth.selectors';
import * as FavoritesActions from '../../../favorites/store/favorites.actions';
import { selectFavoriteIds } from '../../../favorites/store/favorites.selectors';
import * as BookingsActions from '../../../bookings/store/bookings.actions';
import type { MyBooking } from '../../../bookings/models/booking.model';
import { selectMyBookings } from '../../../bookings/store/bookings.selectors';

const BOOKING_DISPLAY_PRIORITY: Partial<Record<MyBooking['status'], number>> = {
  Active: 6,
  Approved: 5,
  PendingApproval: 4,
  Pending: 3,
  ReturnMarked: 2,
  Completed: 1,
  Rejected: 0,
  Cancelled: 0,
};
import { ListingGalleryComponent } from '../../components/listing-gallery/listing-gallery.component';
import { ListingLocationComponent } from '../../components/listing-location/listing-location.component';
import type { ListingDetails } from '../../models/listing-details.model';
import * as ListingsActions from '../../store/listings.actions';
import { ReviewCardComponent } from '../../../reviews/components/review-card/review-card.component';
import * as ReviewsActions from '../../../reviews/store/reviews.actions';
import {
  selectListingToyReviews,
  selectListingToyReviewsLoading,
  selectListingToyReviewsError,
  selectOwnerReviews,
} from '../../../reviews/store/reviews.selectors';
import * as PublicProfilesActions from '../../../public-profiles/store/public-profiles.actions';
import { selectPublicProfile } from '../../../public-profiles/store/public-profiles.selectors';
import {
  selectListingDetailsLoading,
  selectListingsError,
  selectSelectedListing,
} from '../../store/listings.selectors';

export interface ListingDetailsPageViewModel {
  readonly routeId: string | null;
  readonly invalidRoute: boolean;
  readonly displayListing: ListingDetails | null;
  readonly showSkeleton: boolean;
  readonly showError: boolean;
  readonly showContent: boolean;
  readonly error: string | null;
}

export function resolveConditionLabelKey(value: string | null | undefined): string | null {
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

export interface AgeRangeDisplay {
  readonly key: 'listings.details.toyDetails.ageRangeFromTo'
    | 'listings.details.toyDetails.ageRangeFromOnly'
    | 'listings.details.toyDetails.ageRangeToOnly';
  readonly params: { from?: number; to?: number };
}

export function resolveAgeRangeDisplay(
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

export function hasAnyToyDetail(listing: ListingDetails): boolean {
  return (
    resolveAgeRangeDisplay(listing.ageFromMonths, listing.ageToMonths) !== null ||
    (typeof listing.condition === 'string' && listing.condition.trim().length > 0) ||
    (typeof listing.hygieneNotes === 'string' && listing.hygieneNotes.trim().length > 0) ||
    (typeof listing.safetyNotes === 'string' && listing.safetyNotes.trim().length > 0)
  );
}

interface ProtectionBulletKey {
  readonly id: string;
  readonly key: string;
}

const PROTECTION_BULLET_KEYS: readonly ProtectionBulletKey[] = [
  { id: 'b1', key: 'listings.details.protection.bullet1' },
  { id: 'b2', key: 'listings.details.protection.bullet2' },
  { id: 'b3', key: 'listings.details.protection.bullet3' },
  { id: 'b4', key: 'listings.details.protection.bullet4' },
  { id: 'b5', key: 'listings.details.protection.bullet5' },
];

const selectListingDetailsBase = createSelector(
  selectSelectedListing,
  selectListingDetailsLoading,
  selectListingsError,
  (
    listing,
    detailsLoading,
    error,
  ): {
    readonly listing: ListingDetails | null;
    readonly detailsLoading: boolean;
    readonly error: string | null;
  } => ({
    listing,
    detailsLoading,
    error,
  }),
);

@Component({
  selector: 'app-listing-details-page',
  standalone: true,
  imports: [
    AuthDialogComponent,
    ButtonModule,
    CommonModule,
    DramCurrencyPipe,
    ListingGalleryComponent,
    ListingLocationComponent,
    PageHeaderComponent,
    ReviewCardComponent,
    RouterLink,
    SkeletonModule,
    TranslatePipe,
  ],
  templateUrl: './listing-details-page.component.html',
  styleUrl: './listing-details-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingDetailsPageComponent {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly isAuthenticated = this.store.selectSignal(selectIsAuthenticated);
  private readonly currentUser = this.store.selectSignal(selectAuthUser);
  protected readonly showAuthDialog = signal(false);

  private readonly myBookingsSignal = this.store.selectSignal(selectMyBookings);

  protected readonly protectionBullets = PROTECTION_BULLET_KEYS;

  protected readonly resolveConditionLabelKey = resolveConditionLabelKey;
  protected readonly resolveAgeRangeDisplay = resolveAgeRangeDisplay;
  protected readonly hasAnyToyDetail = hasAnyToyDetail;

  private readonly routeId$ = this.route.paramMap.pipe(
    map((params) => params.get('id')),
    distinctUntilChanged(),
  );

  private readonly routeListingId = toSignal(this.routeId$, {
    initialValue: null as string | null,
  });

  private readonly toySummary = toSignal(
    this.routeId$.pipe(
      switchMap((id) =>
        id ? this.store.select(selectListingToyReviews(id)) : of(null),
      ),
    ),
    { initialValue: null },
  );

  protected readonly reviews = computed(() => this.toySummary()?.comments ?? []);

  protected readonly reviewsLoading = toSignal(
    this.routeId$.pipe(
      switchMap((id) =>
        id ? this.store.select(selectListingToyReviewsLoading(id)) : of(false),
      ),
    ),
    { initialValue: false },
  );

  protected readonly reviewsError = toSignal(
    this.routeId$.pipe(
      switchMap((id) =>
        id ? this.store.select(selectListingToyReviewsError(id)) : of(null),
      ),
    ),
    { initialValue: null },
  );

  protected readonly ratingSummary = computed(() => {
    const s = this.toySummary();
    return s && s.hasAggregate
      ? { averageRating: s.overallAverage, reviewCount: s.reviewCount }
      : null;
  });

  private readonly ownerId$ = this.store.select(selectSelectedListing).pipe(
    map((listing) => listing?.owner?.id ?? null),
    distinctUntilChanged(),
  );

  private readonly ownerReviewsSummary = toSignal(
    this.ownerId$.pipe(
      switchMap((id) =>
        id ? this.store.select(selectOwnerReviews(id)) : of(null),
      ),
    ),
    { initialValue: null },
  );

  protected readonly ownerSummary = computed(() => {
    const s = this.ownerReviewsSummary();
    return s && s.hasAggregate
      ? { averageRating: s.overallAverage, reviewCount: s.reviewCount }
      : null;
  });

  protected readonly ownerPublicProfile = toSignal(
    this.ownerId$.pipe(
      switchMap((id) =>
        id ? this.store.select(selectPublicProfile(id)) : of(null),
      ),
    ),
    { initialValue: null },
  );

  protected readonly ownerMemberYear = computed(() => {
    const p = this.ownerPublicProfile();
    if (!p) return null;
    return new Date(p.memberSince).getFullYear().toString();
  });

  private readonly currentListingSignal = this.store.selectSignal(selectSelectedListing);

  protected readonly listingTitle = computed(() => this.currentListingSignal()?.title ?? '');

  /** Cover photo for the Screen 2 full-screen map's plaque thumbnail
   *  (`ListingLocationComponent`'s `imageUrl` input) — same "primary, then
   *  lowest sortOrder" precedence `ListingsQueryService.PrimaryImageUrl`
   *  (rental-api) uses server-side for the catalogue card, so the plaque's
   *  photo always matches whichever image the rest of the app treats as this
   *  listing's cover. `null` when the listing has no images at all; the
   *  plaque renders a placeholder icon in that case rather than a broken
   *  `<img>`. */
  protected readonly listingHeroImageUrl = computed<string | null>(() => {
    const images = this.currentListingSignal()?.images ?? [];
    if (images.length === 0) return null;
    const [first] = [...images].sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });
    return first.url;
  });

  protected readonly existingBookingId = computed<string | null>(() => {
    const listingId = this.routeListingId();
    if (!listingId) return null;
    const booking = this.myBookingsSignal().find(
      (b) =>
        b.listingId === listingId &&
        (b.status === 'Pending' || b.status === 'Approved' || b.status === 'Active'),
    );
    return booking?.id ?? null;
  });

  protected readonly userBooking = computed<MyBooking | null>(() => {
    const listingId = this.routeListingId();
    if (!listingId) return null;
    let best: MyBooking | null = null;
    for (const b of this.myBookingsSignal()) {
      if (b.listingId !== listingId) continue;
      const priority = BOOKING_DISPLAY_PRIORITY[b.status] ?? -1;
      if (priority < 0) continue;
      if (best === null || priority > (BOOKING_DISPLAY_PRIORITY[best.status] ?? -1)) {
        best = b;
      }
    }
    return best;
  });

  protected readonly viewModel$ = combineLatest({
    listingState: this.store.select(selectListingDetailsBase),
    routeId: this.routeId$,
    favoriteIds: this.store.select(selectFavoriteIds),
  }).pipe(
    map(
      ({
        listingState: state,
        routeId,
        favoriteIds,
      }): ListingDetailsPageViewModel => {
        const invalidRoute = routeId === null || routeId === '';
        if (invalidRoute) {
          return {
            routeId: null,
            invalidRoute: true,
            displayListing: null,
            showSkeleton: false,
            showError: true,
            showContent: false,
            error: null,
          };
        }

        const listing = state.listing;
        const loading = state.detailsLoading;
        const err = state.error;
        const hasError = err !== null;
        const idMatches = listing !== null && listing.id === routeId;
        const displayListing = idMatches && listing
          ? { ...listing, isFavorite: favoriteIds.has(listing.id) }
          : null;

        return {
          routeId,
          invalidRoute: false,
          displayListing,
          showSkeleton: loading && !idMatches,
          showError: hasError,
          showContent: idMatches && !loading && !hasError,
          error: err,
        };
      },
    ),
  );

  constructor() {
    // Owners always see the owner ("This is your listing") view, regardless of
    // how they reached the public route — redirect once the listing's owner is
    // confirmed to be the current user. The owner page mirrors the inverse
    // guard (non-owners → public view), so the two never loop.
    effect(() => {
      const id = this.routeListingId();
      const listing = this.currentListingSignal();
      const user = this.currentUser();
      if (
        id !== null &&
        id !== '' &&
        listing !== null &&
        listing.id === id &&
        user !== null &&
        listing.owner.id === user.id
      ) {
        void this.router.navigate(['/my-listings', id], { replaceUrl: true });
      }
    });

    effect(() => {
      const id = this.routeListingId();
      if (id !== null && id !== '') {
        this.store.dispatch(ListingsActions.loadListingDetails({ id }));
        this.store.dispatch(BookingsActions.clearCreateBookingState());
        this.store.dispatch(BookingsActions.clearCancelBookingState());
        this.store.dispatch(ReviewsActions.loadListingToyReviews({ listingId: id }));
      }
    });

    effect(() => {
      const id = this.routeListingId();
      if (id !== null && id !== '' && this.isAuthenticated()) {
        this.store.dispatch(FavoritesActions.loadFavorites());
        this.store.dispatch(BookingsActions.loadMyBookings());
      }
    });

    effect(() => {
      const ownerId = this.currentListingSignal()?.owner?.id;
      if (ownerId) {
        this.store.dispatch(ReviewsActions.loadOwnerReviews({ userId: ownerId }));
        this.store.dispatch(PublicProfilesActions.loadPublicProfile({ userId: ownerId }));
      }
    });
  }

  protected onFavoriteToggle(listing: ListingDetails): void {
    if (!this.isAuthenticated()) {
      this.showAuthDialog.set(true);
      return;
    }
    this.store.dispatch(
      ListingsActions.toggleFavoriteOptimistic({ listingId: listing.id }),
    );
  }

  protected retryLoad(): void {
    const id = this.routeListingId();
    if (id !== null && id !== '') {
      this.store.dispatch(ListingsActions.loadListingDetails({ id }));
    }
  }
}
