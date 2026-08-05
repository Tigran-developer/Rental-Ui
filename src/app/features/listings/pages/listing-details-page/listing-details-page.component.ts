import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
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
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { AuthDialogComponent } from '../../../auth/components/auth-dialog/auth-dialog.component';
import { AvatarComponent } from '../../../../shared/ui/avatar/avatar.component';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header.component';
import { DramCurrencyPipe } from '../../../../shared/utils/dram-currency.pipe';
import { selectAuthUser, selectIsAuthenticated } from '../../../auth/store/auth.selectors';
import * as FavoritesActions from '../../../favorites/store/favorites.actions';
import { selectFavoriteIds } from '../../../favorites/store/favorites.selectors';
import * as BookingsActions from '../../../bookings/store/bookings.actions';
import type { MyBooking } from '../../../bookings/models/booking.model';
import { selectMyBookings } from '../../../bookings/store/bookings.selectors';
import {
  ListingGalleryComponent,
  type GalleryBadge,
} from '../../components/listing-gallery/listing-gallery.component';
import { ListingLocationComponent } from '../../components/listing-location/listing-location.component';
import type { ListingDetails } from '../../models/listing-details.model';
import type { DeliveryType } from '../../models/create-listing.model';
import * as ListingsActions from '../../store/listings.actions';
import { RatingSummaryComponent } from '../../../reviews/components/rating-summary/rating-summary.component';
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

/** Desktop shows 3 review cards before "See all"; mobile shows 2 — done in
 *  CSS (nth-child) off a single 3-item signal slice, rather than a second
 *  breakpoint-aware signal, to keep this page on the one documented 1100px
 *  ladder used everywhere else on it (DESIGN_RULES §3). */
const REVIEWS_PREVIEW_COUNT = 3;

const PROTECTION_TITLE_KEY = 'listings.details.protection.title';
const PROTECTION_INTRO_KEY = 'listings.details.protection.intro';

/**
 * The design mocks 5 protection bullets. Two of them (damage/wear claims
 * against the deposit, and an automatic "fully refunded" promise) describe a
 * claims/refund process DoRent does not actually run — deposits are agreed
 * and exchanged directly between owner and renter, off-platform, with no
 * backend dispute/claim/refund mechanism at all (verified against
 * `BookingsService`/`BookingStatus` — no such step exists). Rendering them
 * would promise something the platform can't back up, so only the 3 bullets
 * that describe real, backend-verifiable or platform-neutral facts are kept:
 * hygiene notes are a real owner-authored field, safety guidance is neutral
 * advice, and DoRent support email is a real, working contact channel
 * (`support@dorent.am`, see the FAQ page).
 */
const PROTECTION_BULLET_KEYS: readonly string[] = [
  'listings.details.protection.bullet3',
  'listings.details.protection.bullet4',
  'listings.details.protection.bullet5',
];

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
  readonly key:
    | 'listings.details.toyDetails.ageRangeFromTo'
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

/** Re-exported for `owner-listing-page` (my-listings feature, out of scope
 *  for this rebuild) which still imports this helper directly. */
export function hasAnyToyDetail(listing: ListingDetails): boolean {
  return (
    resolveAgeRangeDisplay(listing.ageFromMonths, listing.ageToMonths) !== null ||
    (typeof listing.condition === 'string' && listing.condition.trim().length > 0) ||
    (typeof listing.hygieneNotes === 'string' && listing.hygieneNotes.trim().length > 0) ||
    (typeof listing.safetyNotes === 'string' && listing.safetyNotes.trim().length > 0)
  );
}

/** One tile in the highlights band / specs quad / pickup & delivery rows —
 *  every field driving these must trace back to a real listing/owner field. */
export interface DetailTile {
  readonly id: string;
  readonly icon: string;
  readonly titleKey: string;
  readonly titleParams?: Record<string, unknown>;
  readonly subKey?: string;
  readonly subParams?: Record<string, unknown>;
}

export interface DetailRow {
  readonly id: string;
  readonly icon: string;
  readonly labelKey: string;
  readonly valueKey?: string;
  readonly valueParams?: Record<string, unknown>;
  /** Pre-formatted value (e.g. currency via `dram`) instead of an i18n key. */
  readonly valueText?: string;
}

function deliveryLabelKey(type: DeliveryType): string {
  return type === 'Courier' ? 'listings.createForm.delivery.deliver' : 'listings.createForm.delivery.pickup';
}

function deliveryHintKey(type: DeliveryType): string {
  return type === 'Courier'
    ? 'listings.createForm.delivery.deliverHint'
    : 'listings.createForm.delivery.pickupHint';
}

@Component({
  selector: 'app-listing-details-page',
  standalone: true,
  imports: [
    AuthDialogComponent,
    AvatarComponent,
    ButtonModule,
    DecimalPipe,
    DramCurrencyPipe,
    ListingGalleryComponent,
    ListingLocationComponent,
    NgTemplateOutlet,
    PageHeaderComponent,
    RatingSummaryComponent,
    ReviewCardComponent,
    RouterLink,
    SkeletonModule,
    TranslatePipe,
  ],
  // `DramCurrencyPipe` is also `inject()`-ed directly below (for values that
  // need formatting outside the template — see `formatDram()`). Listing it
  // in `imports` only makes `| dram` resolvable in the template; it does NOT
  // register it as an injectable, so it must be listed here too or the
  // component throws NG0201 on construction (it did — see
  // `listing-details-page.component.spec.ts`, "DI construction").
  providers: [DramCurrencyPipe],
  templateUrl: './listing-details-page.component.html',
  styleUrl: './listing-details-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingDetailsPageComponent {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly dramPipe = inject(DramCurrencyPipe);

  protected readonly isAuthenticated = this.store.selectSignal(selectIsAuthenticated);
  private readonly currentUser = this.store.selectSignal(selectAuthUser);
  protected readonly showAuthDialog = signal(false);
  protected readonly reviewsExpanded = signal(false);

  private readonly myBookingsSignal = this.store.selectSignal(selectMyBookings);

  protected readonly resolveConditionLabelKey = resolveConditionLabelKey;
  protected readonly resolveAgeRangeDisplay = resolveAgeRangeDisplay;
  protected readonly protectionTitleKey = PROTECTION_TITLE_KEY;
  protected readonly protectionIntroKey = PROTECTION_INTRO_KEY;
  protected readonly protectionBullets = PROTECTION_BULLET_KEYS;

  // ── Route ────────────────────────────────────────────────────────────────
  private readonly routeId$ = this.route.paramMap.pipe(
    map((params) => params.get('id')),
    distinctUntilChanged(),
  );

  private readonly routeListingId = toSignal(this.routeId$, {
    initialValue: null as string | null,
  });

  // ── Core listing state — plain signals/computed, no combineLatest ─────────
  private readonly rawListing = this.store.selectSignal(selectSelectedListing);
  private readonly detailsLoading = this.store.selectSignal(selectListingDetailsLoading);
  protected readonly listingsError = this.store.selectSignal(selectListingsError);
  private readonly favoriteIds = this.store.selectSignal(selectFavoriteIds);

  protected readonly invalidRoute = computed(
    () => this.routeListingId() === null || this.routeListingId() === '',
  );

  private readonly idMatches = computed(() => {
    const listing = this.rawListing();
    return listing !== null && listing.id === this.routeListingId();
  });

  protected readonly displayListing = computed<ListingDetails | null>(() => {
    const listing = this.rawListing();
    if (!this.idMatches() || listing === null) {
      return null;
    }
    return { ...listing, isFavorite: this.favoriteIds().has(listing.id) };
  });

  protected readonly showSkeleton = computed(
    () => !this.invalidRoute() && this.detailsLoading() && !this.idMatches(),
  );

  protected readonly showError = computed(
    () => this.invalidRoute() || this.listingsError() !== null,
  );

  protected readonly showContent = computed(
    () =>
      !this.invalidRoute() &&
      this.idMatches() &&
      !this.detailsLoading() &&
      this.listingsError() === null,
  );

  protected readonly listingTitle = computed(() => this.rawListing()?.title ?? '');

  /** Cover photo for the Screen 2 full-screen map's plaque thumbnail
   *  (`ListingLocationComponent`'s `imageUrl` input) — same "primary, then
   *  lowest sortOrder" precedence `ListingsQueryService.PrimaryImageUrl`
   *  (rental-api) uses server-side for the catalogue card, so the plaque's
   *  photo always matches whichever image the rest of the app treats as this
   *  listing's cover. `null` when the listing has no images at all; the
   *  plaque renders a placeholder icon in that case rather than a broken
   *  `<img>`. */
  protected readonly listingHeroImageUrl = computed<string | null>(() => {
    const images = this.rawListing()?.images ?? [];
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

  // ── Breadcrumb ──────────────────────────────────────────────────────────
  protected readonly categoryName = computed(() => this.displayListing()?.category?.name ?? null);

  // ── Toy reviews (per-route) ─────────────────────────────────────────────
  private readonly toySummary = toSignal(
    this.routeId$.pipe(
      switchMap((id) => (id ? this.store.select(selectListingToyReviews(id)) : of(null))),
    ),
    { initialValue: null },
  );

  protected readonly reviews = computed(() => this.toySummary()?.comments ?? []);

  protected readonly reviewsLoading = toSignal(
    this.routeId$.pipe(
      switchMap((id) => (id ? this.store.select(selectListingToyReviewsLoading(id)) : of(false))),
    ),
    { initialValue: false },
  );

  protected readonly reviewsError = toSignal(
    this.routeId$.pipe(
      switchMap((id) => (id ? this.store.select(selectListingToyReviewsError(id)) : of(null))),
    ),
    { initialValue: null },
  );

  protected readonly ratingSummary = computed(() => {
    const s = this.toySummary();
    return s && s.hasAggregate
      ? { averageRating: s.overallAverage, reviewCount: s.reviewCount }
      : null;
  });

  /** For `app-rating-summary`'s `[summary]` input (average/reviewCount/hasAggregate shape). */
  protected readonly toyRatingSummaryView = computed(() => {
    const s = this.toySummary();
    return {
      average: s?.overallAverage ?? 0,
      reviewCount: s?.reviewCount ?? 0,
      hasAggregate: s?.hasAggregate ?? false,
    };
  });

  protected readonly reviewsDistribution = computed<readonly number[] | null>(
    () => this.toySummary()?.distribution ?? null,
  );

  protected readonly visibleReviews = computed(() =>
    this.reviewsExpanded() ? this.reviews() : this.reviews().slice(0, REVIEWS_PREVIEW_COUNT),
  );

  /**
   * Threshold is 2, not `REVIEWS_PREVIEW_COUNT` (3) — mobile hides the 3rd
   * preview card via CSS (see `.detail-page__review-item--desktop-only`), so
   * a listing with exactly 3 reviews still has one hidden on mobile and needs
   * this control to reach it, even though desktop already shows all 3.
   */
  protected readonly showSeeAllReviews = computed(
    () => !this.reviewsExpanded() && this.reviews().length > 2,
  );

  protected toggleReviewsExpanded(): void {
    this.reviewsExpanded.set(true);
  }

  // ── Owner (per-route) ────────────────────────────────────────────────────
  private readonly ownerId$ = this.store.select(selectSelectedListing).pipe(
    map((listing) => listing?.owner?.id ?? null),
    distinctUntilChanged(),
  );

  private readonly ownerReviewsSummary = toSignal(
    this.ownerId$.pipe(
      switchMap((id) => (id ? this.store.select(selectOwnerReviews(id)) : of(null))),
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
      switchMap((id) => (id ? this.store.select(selectPublicProfile(id)) : of(null))),
    ),
    { initialValue: null },
  );

  protected readonly ownerMemberYear = computed(() => {
    const p = this.ownerPublicProfile();
    if (!p) return null;
    return new Date(p.memberSince).getFullYear().toString();
  });

  protected readonly ownerIsVerified = computed(() => this.ownerPublicProfile()?.isVerified === true);

  /** Owner stat row on the owner card — only stats the public profile actually
   *  returns. `responseRate` is deliberately excluded: it's hardcoded `null`
   *  server-side today (see the profile DTO), so it would always be fake. */
  protected readonly ownerStats = computed(() => {
    const profile = this.ownerPublicProfile();
    if (!profile) return [];
    const stats: { id: string; value: string; labelKey: string }[] = [];
    if (profile.ownerReviewCount > 0 && profile.ownerRating !== null) {
      stats.push({
        id: 'rating',
        value: profile.ownerRating.toFixed(1),
        labelKey: 'listings.details.ownerStats.rating',
      });
    }
    stats.push({
      id: 'listings',
      value: String(profile.activeListingsCount),
      labelKey: 'listings.details.ownerStats.listings',
    });
    stats.push({
      id: 'completed',
      value: String(profile.completedRentalsAsOwner),
      labelKey: 'listings.details.ownerStats.completed',
    });
    return stats;
  });

  // ── Gallery trust badges (desktop overlay) + mobile badge row ───────────
  protected readonly trustBadges = computed<GalleryBadge[]>(() => {
    const listing = this.displayListing();
    if (!listing) return [];
    const badges: GalleryBadge[] = [];
    if (this.ownerIsVerified()) {
      badges.push({
        icon: 'pi pi-verified',
        label: this.translate.instant('listings.details.badges.verifiedOwner'),
        tone: 'success',
      });
    }
    if (listing.hygieneNotes) {
      badges.push({
        icon: 'pi pi-shield',
        label: this.translate.instant('listings.details.badges.hygieneChecked'),
        tone: 'info',
      });
    }
    return badges;
  });

  // ── Highlights band (2–4 real-data tiles) ────────────────────────────────
  protected readonly highlightTiles = computed<DetailTile[]>(() => {
    const listing = this.displayListing();
    if (!listing) return [];
    const tiles: DetailTile[] = [];

    if (listing.hygieneNotes) {
      tiles.push({
        id: 'hygiene',
        icon: 'pi pi-shield',
        titleKey: 'listings.card.hygieneProvided',
        subKey: 'listings.details.highlights.hygieneSub',
      });
    }
    if (this.ownerIsVerified()) {
      tiles.push({
        id: 'verified',
        icon: 'pi pi-verified',
        titleKey: 'listings.details.highlights.verifiedTitle',
        subKey: 'listings.details.highlights.verifiedSub',
      });
    }
    if (listing.deliveryType) {
      tiles.push(
        listing.deliveryType === 'Courier'
          ? {
              id: 'delivery',
              icon: 'pi pi-truck',
              titleKey: 'listings.details.highlights.deliveryAvailableTitle',
              subKey: 'listings.details.highlights.deliveryAvailableSub',
            }
          : {
              id: 'delivery',
              icon: 'pi pi-map-marker',
              titleKey: 'listings.details.highlights.pickupOnlyTitle',
              subKey: 'listings.details.highlights.pickupOnlySub',
            },
      );
    }
    // Only worth a highlight when it's a real constraint above the default.
    if (typeof listing.minRentalDays === 'number' && listing.minRentalDays > 1) {
      tiles.push({
        id: 'minRental',
        icon: 'pi pi-calendar-clock',
        titleKey: 'listings.details.highlights.minStayTitle',
        titleParams: { count: listing.minRentalDays },
        subKey: 'listings.details.highlights.minStaySub',
      });
    }

    // The design only ever draws 2–4 tiles in one even row; a lone tile has
    // no graceful column layout, so hide the band rather than render it oddly.
    return tiles.length >= 2 ? tiles.slice(0, 4) : [];
  });

  protected readonly highlightColumns = computed(() => this.highlightTiles().length);

  // ── Specs quad (best age / condition / deposit / handover) ─────────────
  protected readonly specTiles = computed<DetailTile[]>(() => {
    const listing = this.displayListing();
    if (!listing) return [];
    const tiles: DetailTile[] = [];

    const ageRange = resolveAgeRangeDisplay(listing.ageFromMonths, listing.ageToMonths);
    if (ageRange) {
      tiles.push({
        id: 'age',
        icon: 'pi pi-user',
        titleKey: 'listings.details.toyDetails.ageRange',
        subKey: ageRange.key,
        subParams: ageRange.params,
      });
    }
    if (listing.condition) {
      const conditionKey = resolveConditionLabelKey(listing.condition);
      tiles.push({
        id: 'condition',
        icon: 'pi pi-verified',
        titleKey: 'listings.details.toyDetails.condition',
        subKey: conditionKey ?? undefined,
      });
    }
    if (typeof listing.depositAmount === 'number' && listing.depositAmount > 0) {
      tiles.push({
        id: 'deposit',
        icon: 'pi pi-wallet',
        titleKey: 'listings.details.toyDetails.deposit',
        subKey: 'listings.details.toyDetails.depositValue',
        // Pre-formatted (not the raw number) — a translate param is a plain
        // string substitution, it can't apply the `dram` pipe itself.
        subParams: { amount: this.formatDram(listing.depositAmount) },
      });
    }
    if (listing.deliveryType) {
      tiles.push({
        id: 'delivery',
        icon: listing.deliveryType === 'Courier' ? 'pi pi-truck' : 'pi pi-map-marker',
        titleKey: 'listings.details.handoverLabel',
        subKey: deliveryLabelKey(listing.deliveryType),
      });
    }
    return tiles;
  });

  protected readonly safetyNotes = computed(() => this.displayListing()?.safetyNotes ?? null);

  // ── Pickup & delivery trust rows (beside the map) ────────────────────────
  protected readonly pickupDeliveryRows = computed<DetailRow[]>(() => {
    const listing = this.displayListing();
    if (!listing) return [];
    const rows: DetailRow[] = [];

    if (listing.deliveryType) {
      rows.push({
        id: 'handover',
        icon: listing.deliveryType === 'Courier' ? 'pi pi-truck' : 'pi pi-map-marker',
        labelKey: 'listings.details.handoverLabel',
        valueKey: deliveryHintKey(listing.deliveryType),
      });
    }
    if (typeof listing.minRentalDays === 'number' && listing.minRentalDays > 0) {
      rows.push({
        id: 'minRental',
        icon: 'pi pi-calendar',
        labelKey: 'listings.createForm.minRental.label',
        valueKey: listing.minRentalDays === 1 ? 'listings.booking.night' : 'listings.booking.nights',
        valueParams: { count: listing.minRentalDays },
      });
    }
    if (typeof listing.depositAmount === 'number' && listing.depositAmount > 0) {
      rows.push({
        id: 'deposit',
        icon: 'pi pi-wallet',
        labelKey: 'listings.details.toyDetails.deposit',
        valueText: this.formatDram(listing.depositAmount),
      });
    }
    if (listing.hygieneNotes) {
      rows.push({
        id: 'hygiene',
        icon: 'pi pi-shield',
        labelKey: 'listings.card.hygieneProvided',
        valueKey: 'listings.details.pickupDelivery.hygieneValue',
      });
    }
    return rows;
  });

  /**
   * `DramCurrencyPipe` invoked directly (not via the `| dram` template
   * pipe) for the two cases where formatted currency needs to end up either
   * as a plain-text row value or interpolated into an i18n param — a
   * template pipe binding can't reach into either of those.
   */
  private formatDram(amount: number): string {
    return this.dramPipe.transform(amount) ?? '';
  }

  constructor() {
    // Owners always see the owner ("This is your listing") view, regardless of
    // how they reached the public route — redirect once the listing's owner is
    // confirmed to be the current user. The owner page mirrors the inverse
    // guard (non-owners → public view), so the two never loop.
    effect(() => {
      const id = this.routeListingId();
      const listing = this.rawListing();
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
        this.reviewsExpanded.set(false);
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
      const ownerId = this.rawListing()?.owner?.id;
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
    this.store.dispatch(ListingsActions.toggleFavoriteOptimistic({ listingId: listing.id }));
  }

  protected retryLoad(): void {
    const id = this.routeListingId();
    if (id !== null && id !== '') {
      this.store.dispatch(ListingsActions.loadListingDetails({ id }));
    }
  }

  /** `navigator.share` on devices that support it (mobile mostly); clipboard
   *  copy + toast everywhere else. Never silently fails — a rejected/cancelled
   *  native share sheet is not an error and is swallowed intentionally. */
  protected async onShare(listing: ListingDetails): Promise<void> {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: listing.title, url });
      } catch {
        // User cancelled the share sheet, or the platform rejected it — no toast either way.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('listings.details.linkCopied'),
        life: 2500,
      });
    } catch {
      // Clipboard permission denied — nothing meaningful we can do; avoid a
      // toast that claims success when it didn't happen.
    }
  }
}
