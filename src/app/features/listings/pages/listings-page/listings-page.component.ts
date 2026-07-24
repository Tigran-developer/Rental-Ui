import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Store, createSelector } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { MessageService } from 'primeng/api';
import { combineLatest, map, of, switchMap } from 'rxjs';

import { EmptyStateComponent } from '../../../../shared/ui/empty-state/empty-state.component';
import { LoadingSkeletonComponent } from '../../../../shared/ui/loading-skeleton/loading-skeleton.component';
import { AuthDialogComponent } from '../../../auth/components/auth-dialog/auth-dialog.component';
import { selectIsAuthenticated } from '../../../auth/store/auth.selectors';
import { MyListingsApiService } from '../../../my-listings/services/my-listings-api.service';
import * as BookingsActions from '../../../bookings/store/bookings.actions';
import type { BookingStatus } from '../../../bookings/models/booking.model';
import { selectMyBookings } from '../../../bookings/store/bookings.selectors';
import { selectFavoriteIds } from '../../../favorites/store/favorites.selectors';
import { ListingCardComponent } from '../../components/listing-card/listing-card.component';
import { ListingsFiltersComponent } from '../../components/listings-filters/listings-filters.component';
import { parseDistrictIdsParam } from '../../models/listings-filter.model';
import type { ListingsFilter } from '../../models/listings-filter.model';
import type { ListingPreview } from '../../models/listing.model';
import * as ListingsActions from '../../store/listings.actions';

import {
  selectListingCategories,
  selectListingItems,
  selectListingsError,
  selectListingsFilters,
  selectListingsHasMore,
  selectListingsLoading,
  selectListingsOriginCoords,
  selectListingsPageSize,
} from '../../store/listings.selectors';
import type { ParamMap } from '@angular/router';

const BOOKING_STATUS_PRIORITY: Partial<Record<BookingStatus, number>> = {
  Active: 6,
  Approved: 5,
  PendingApproval: 4,
  Pending: 3,
  ReturnMarked: 2,
  Completed: 1,
  Rejected: 0,
  Cancelled: 0,
};

export interface ListingsPageViewModel {
  readonly items: ListingPreview[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly hasMore: boolean;
  readonly pageSize: number;
  readonly showInitialSkeleton: boolean;
  readonly showAppendSkeleton: boolean;
  readonly showEmpty: boolean;
  readonly showLoadMore: boolean;
  readonly hasError: boolean;
  readonly hasActiveFilters: boolean;
  readonly isAuthenticated: boolean;
}

const selectListingsPageViewModel = createSelector(
  selectListingItems,
  selectListingsLoading,
  selectListingsError,
  selectListingsHasMore,
  selectListingsPageSize,
  selectListingsFilters,
  selectIsAuthenticated,
  selectFavoriteIds,
  (items, loading, error, hasMore, pageSize, filters, isAuthenticated, favoriteIds): ListingsPageViewModel => {
    const hasError = error !== null;
    const hasActiveFilters =
      filters !== null &&
      Object.values(filters).some((v) =>
        Array.isArray(v) ? v.length > 0 : v !== null && v !== '',
      );
    return {
      items: items.map((i) => ({ ...i, isFavorite: favoriteIds.has(i.id) })),
      loading,
      error,
      hasMore,
      pageSize,
      showInitialSkeleton: loading && items.length === 0,
      showAppendSkeleton: loading && items.length > 0,
      showEmpty: !loading && items.length === 0 && !hasError,
      showLoadMore: hasMore && !hasError && !loading,
      hasError,
      hasActiveFilters,
      isAuthenticated,
    };
  },
);

type SortBy = '' | 'price_asc' | 'price_desc' | 'rating_desc' | 'newest';

interface SortOption {
  readonly value: SortBy;
  readonly labelKey: string;
  readonly icon: string;
}

const SORT_OPTIONS: readonly SortOption[] = [
  { value: 'price_asc',   labelKey: 'listings.page.sortLowestPrice',   icon: 'pi pi-tag' },
  { value: 'price_desc',  labelKey: 'listings.page.sortHighestPrice',  icon: 'pi pi-tag' },
  { value: 'rating_desc', labelKey: 'listings.page.sortHighestRated',  icon: 'pi pi-star' },
  { value: 'newest',      labelKey: 'listings.page.sortNewest',        icon: 'pi pi-clock' },
];

function applySort(items: ListingPreview[], sortBy: string): ListingPreview[] {
  if (sortBy === 'price_asc')  return [...items].sort((a, b) => a.pricePerDay - b.pricePerDay);
  if (sortBy === 'price_desc') return [...items].sort((a, b) => b.pricePerDay - a.pricePerDay);
  return items;
}

const AGE_GROUPS = [
  { value: '0-12',   label: '0–1 yr' },
  { value: '12-36',  label: '1–3 yr' },
  { value: '36-72',  label: '3–6 yr' },
  { value: '72-120', label: '6–10 yr' },
  { value: '120+',   label: '10+ yr' },
] as const;

const DISTANCES = [
  { value: 1,    label: '< 1 km' },
  { value: 3,    label: '< 3 km' },
  { value: 5,    label: '< 5 km' },
  { value: null, label: 'Any' },
] as const;

@Component({
  selector: 'app-listings-page',
  standalone: true,
  imports: [
    AuthDialogComponent,
    ButtonModule,
    EmptyStateComponent,
    ListingCardComponent,
    ListingsFiltersComponent,
    LoadingSkeletonComponent,
    MessageModule,
    TranslatePipe,
  ],
  templateUrl: './listings-page.component.html',
  styleUrl: './listings-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingsPageComponent {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);

  protected readonly isAuthenticated = this.store.selectSignal(selectIsAuthenticated);
  protected readonly showAuthDialog = signal(false);

  private readonly myListingsApi = inject(MyListingsApiService);

  protected readonly myListingIds = toSignal(
    toObservable(this.isAuthenticated).pipe(
      switchMap((isAuth) =>
        isAuth
          ? this.myListingsApi
              .getMyListings()
              .pipe(map((listings) => new Set(listings.map((l) => l.id))))
          : of(new Set<string>()),
      ),
    ),
    { initialValue: new Set<string>() },
  );

  private readonly myBookingsSignal = this.store.selectSignal(selectMyBookings);

  protected readonly bookingStatusMap = computed(() => {
    const map = new Map<string, BookingStatus>();
    for (const b of this.myBookingsSignal()) {
      const incoming = BOOKING_STATUS_PRIORITY[b.status] ?? -1;
      if (incoming < 0) continue;
      const existing = map.get(b.listingId);
      if (existing === undefined || incoming > (BOOKING_STATUS_PRIORITY[existing] ?? -1)) {
        map.set(b.listingId, b.status);
      }
    }
    return map;
  });
  protected readonly sortBy = signal<SortBy>('');
  protected readonly sortMenuOpen = signal(false);
  protected readonly sortOptions = SORT_OPTIONS;

  protected readonly activeSortOption = computed(() =>
    SORT_OPTIONS.find(o => o.value === this.sortBy()) ?? null
  );

  private readonly itemsSignal = this.store.selectSignal(selectListingItems);
  private readonly hasMoreSignal = this.store.selectSignal(selectListingsHasMore);
  private readonly filtersSignal = this.store.selectSignal(selectListingsFilters);
  private readonly originCoordsSignal = this.store.selectSignal(selectListingsOriginCoords);
  protected readonly categoriesSignal = this.store.selectSignal(selectListingCategories);

  protected readonly activeCategoryId = computed(() => this.filtersSignal().categoryId);
  protected readonly activeAgeGroup   = computed(() => this.filtersSignal().ageGroup);
  protected readonly activeMaxDistance = computed(() => this.filtersSignal().maxDistance);
  protected readonly activeMinPrice   = computed(() => this.filtersSignal().minPrice);
  protected readonly activeMaxPrice   = computed(() => this.filtersSignal().maxPrice);

  protected readonly ageGroups  = AGE_GROUPS;
  protected readonly distances  = DISTANCES;

  protected readonly activeCategoryName = computed(() => {
    const id = this.filtersSignal().categoryId;
    if (!id) return null;
    return this.categoriesSignal().find((c) => c.id === id)?.name ?? null;
  });

  protected readonly activeQuery = computed(() => this.filtersSignal().query ?? '');

  protected readonly hasSidebarFilters = computed(() => {
    const f = this.filtersSignal();
    return !!(f.categoryId || f.ageGroup || f.minPrice != null || f.maxPrice != null || f.maxDistance != null);
  });

  protected readonly activeFilterChips = computed(() => {
    const f = this.filtersSignal();
    const chips: { key: string; label: string }[] = [];
    if (f.categoryId) {
      const cat = this.categoriesSignal().find((c) => c.id === f.categoryId);
      chips.push({ key: 'categoryId', label: cat?.name ?? f.categoryId });
    }
    if (f.ageGroup) {
      const ag = AGE_GROUPS.find((a) => a.value === f.ageGroup);
      chips.push({ key: 'ageGroup', label: ag?.label ?? f.ageGroup });
    }
    if (f.maxDistance != null) {
      const d = DISTANCES.find((dist) => dist.value === f.maxDistance);
      chips.push({ key: 'maxDistance', label: d?.label ?? `< ${f.maxDistance} km` });
    }
    return chips;
  });

  protected readonly resultCountLabel = computed(() => {
    const n = this.itemsSignal().length;
    const suffix = this.hasMoreSignal() ? '+' : '';
    return `${n}${suffix}`;
  });

  protected readonly viewModel$ = combineLatest([
    this.store.select(selectListingsPageViewModel),
    toObservable(this.sortBy),
  ]).pipe(
    map(([vm, sort]) => ({ ...vm, items: applySort(vm.items, sort) })),
  );

  protected readonly vm = toSignal(this.viewModel$);

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const filters = this.parseFiltersFromParams(params);
        this.store.dispatch(ListingsActions.updateFilters({ filters }));
        this.store.dispatch(ListingsActions.loadListings());
      });

    effect(() => {
      if (this.isAuthenticated()) {
        this.store.dispatch(BookingsActions.loadMyBookings());
      }
    });
  }

  // URL is the source of truth; the queryParamMap subscription above handles all reloads.
  protected onFiltersChanged(_filters: ListingsFilter): void {}

  protected onFavoriteToggled(listingId: string): void {
    if (!this.isAuthenticated()) {
      this.showAuthDialog.set(true);
      return;
    }
    this.store.dispatch(ListingsActions.toggleFavoriteOptimistic({ listingId }));
  }

  protected loadMore(): void {
    this.store.dispatch(ListingsActions.loadNextPage());
  }

  protected retryAfterError(): void {
    this.store.dispatch(ListingsActions.loadListings());
  }

  protected clearFilters(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  protected onNotifyMe(): void {
    if (!this.isAuthenticated()) {
      this.showAuthDialog.set(true);
    }
  }

  protected toggleSortMenu(): void {
    this.sortMenuOpen.update(v => !v);
  }

  protected selectSort(value: SortBy): void {
    this.sortBy.set(this.sortBy() === value ? '' : value);
    this.sortMenuOpen.set(false);
  }

  protected skeletonCount(vm: ListingsPageViewModel): number {
    return Math.min(Math.max(vm.pageSize, 1), 12);
  }

  protected goBack(): void {
    if (window.history.length > 1) {
      this.location.back();
    } else {
      void this.router.navigate(['/']);
    }
  }

  protected selectCategory(id: string | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { categoryId: id },
      queryParamsHandling: 'merge',
    });
  }

  protected selectAgeGroup(value: string): void {
    const current = this.filtersSignal().ageGroup;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ageGroup: current === value ? null : value },
      queryParamsHandling: 'merge',
    });
  }

  protected selectDistance(value: number | null): void {
    const current = this.filtersSignal().maxDistance;
    const nextValue = current === value ? null : value;

    if (nextValue === null) {
      this.applyMaxDistance(null);
      return;
    }

    if (this.originCoordsSignal() !== null) {
      this.applyMaxDistance(nextValue);
      return;
    }

    this.requestOriginCoords(nextValue);
  }

  private applyMaxDistance(value: number | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { maxDistance: value },
      queryParamsHandling: 'merge',
    });
  }

  /**
   * Requests the renter's position once per session (cached in the store as
   * `originCoords` — never persisted, never written to the URL, per Maps
   * P2-3). Only activates the distance chip once the browser grants
   * permission; on denial/error/unavailable, surfaces a toast and leaves the
   * chip inactive so the UI never shows a filter it can't honor.
   */
  private requestOriginCoords(nextDistance: number): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.showGeolocationError();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.store.dispatch(
          ListingsActions.setOriginCoords({
            coords: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            },
          }),
        );
        this.applyMaxDistance(nextDistance);
      },
      () => {
        this.showGeolocationError();
      },
    );
  }

  private showGeolocationError(): void {
    this.messageService.add({
      severity: 'warn',
      summary: this.translate.instant('listings.page.geolocationErrorTitle'),
      detail: this.translate.instant('listings.page.geolocationErrorDetail'),
    });
  }

  protected setMinPrice(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    const num = val.trim() ? Number(val) : null;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { minPrice: num ?? null },
      queryParamsHandling: 'merge',
    });
  }

  protected setMaxPrice(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    const num = val.trim() ? Number(val) : null;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { maxPrice: num ?? null },
      queryParamsHandling: 'merge',
    });
  }

  protected removeFilterChip(key: string): void {
    const paramKey =
      key === 'categoryId'  ? 'categoryId'  :
      key === 'city'        ? 'city'        :
      key === 'minPrice'    ? 'minPrice'    :
      key === 'maxPrice'    ? 'maxPrice'    :
      key === 'ageGroup'    ? 'ageGroup'    :
      key === 'maxDistance' ? 'maxDistance' :
      null;
    if (!paramKey) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [paramKey]: null },
      queryParamsHandling: 'merge',
    });
  }

  protected selectCategoryFromSidebar(id: string): void {
    const current = this.filtersSignal().categoryId;
    this.selectCategory(current === id ? null : id);
  }

  private parseFiltersFromParams(params: ParamMap): ListingsFilter {
    const q = params.get('q');
    const city = params.get('city');
    const categoryId = params.get('categoryId');
    const minPriceStr = params.get('minPrice');
    const maxPriceStr = params.get('maxPrice');
    const ageGroup = params.get('ageGroup');
    const maxDistanceStr = params.get('maxDistance');
    return {
      query: q?.trim() || null,
      city: city?.trim() || null,
      categoryId: categoryId?.trim() || null,
      minPrice:
        minPriceStr != null && !Number.isNaN(Number(minPriceStr))
          ? Number(minPriceStr)
          : null,
      maxPrice:
        maxPriceStr != null && !Number.isNaN(Number(maxPriceStr))
          ? Number(maxPriceStr)
          : null,
      ageGroup: ageGroup?.trim() || null,
      maxDistance:
        maxDistanceStr != null && !Number.isNaN(Number(maxDistanceStr))
          ? Number(maxDistanceStr)
          : null,
      districtIds: parseDistrictIdsParam(params.get('districtIds')),
    };
  }
}
