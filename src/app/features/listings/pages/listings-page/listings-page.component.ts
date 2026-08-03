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
import { catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';

import { LanguageService } from '../../../../shared/services/language.service';
import { EmptyStateComponent } from '../../../../shared/ui/empty-state/empty-state.component';
import { LoadingSkeletonComponent } from '../../../../shared/ui/loading-skeleton/loading-skeleton.component';
import { DRAM_SYMBOL } from '../../../../shared/utils/dram-currency.pipe';
import { AuthDialogComponent } from '../../../auth/components/auth-dialog/auth-dialog.component';
import { selectIsAuthenticated } from '../../../auth/store/auth.selectors';
import { MyListingsApiService } from '../../../my-listings/services/my-listings-api.service';
import * as BookingsActions from '../../../bookings/store/bookings.actions';
import type { BookingStatus } from '../../../bookings/models/booking.model';
import { selectMyBookings } from '../../../bookings/store/bookings.selectors';
import { selectFavoriteIds } from '../../../favorites/store/favorites.selectors';
import { ListingCardComponent } from '../../components/listing-card/listing-card.component';
import { ListingsFiltersComponent } from '../../components/listings-filters/listings-filters.component';
import { ListingsMapComponent } from '../../components/listings-map/listings-map.component';
import { RadiusOriginFilterComponent } from '../../components/radius-origin-filter/radius-origin-filter.component';
import { districtDisplayName } from '../../models/district-ui.util';
import type { ListingDistrict } from '../../models/district.model';
import {
  parseDistrictIdsParam,
  parseRadiusKmParam,
  serializeDistrictIdsParam,
  serializeRadiusKmParam,
} from '../../models/listings-filter.model';
import type { ListingsFilter } from '../../models/listings-filter.model';
import { formatDistanceMeters, kmToMeters, localeTagForLanguage, metersToKm } from '../../models/radius-scale.util';
import type { ListingPreview } from '../../models/listing.model';
import { ListingsApiService } from '../../services/listings-api.service';
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

/** Desktop toolbar's removable-filter-chip row. `districtId` is only set for
 *  `key: 'districtId'` — several district chips share that key, so removal
 *  needs to know which one to drop (same reasoning as the mobile sheet's
 *  own `ActiveChip` in `listings-filters.component.ts`). */
interface ActiveFilterChip {
  readonly key: string;
  readonly label: string;
  readonly districtId?: string;
}

type SortBy = '' | 'price_asc' | 'price_desc' | 'rating_desc' | 'newest';

/**
 * Maps P2-2: which surface the results area shows — `?view=map` in the URL,
 * parsed SEPARATELY from `ListingsFilter` (see `viewMode` below for why:
 * folding it into the filter model would leak `view` into
 * `buildListingsQueryParams()` and send it to the backend, which has no
 * such query parameter). Any value other than the literal `map` (including
 * absent) means `list` — the page's default, unchanged surface.
 */
type ListingsViewMode = 'list' | 'map';

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

@Component({
  selector: 'app-listings-page',
  standalone: true,
  imports: [
    AuthDialogComponent,
    ButtonModule,
    EmptyStateComponent,
    ListingCardComponent,
    ListingsFiltersComponent,
    ListingsMapComponent,
    LoadingSkeletonComponent,
    MessageModule,
    RadiusOriginFilterComponent,
    TranslatePipe,
  ],
  templateUrl: './listings-page.component.html',
  styleUrl: './listings-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingsPageComponent {
  /** Price-input prefix in the sidebar — same source `DramCurrencyPipe` formats with. */
  protected readonly dramSymbol = DRAM_SYMBOL;

  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly translate = inject(TranslateService);
  private readonly listingsApi = inject(ListingsApiService);
  private readonly languageService = inject(LanguageService);

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

  /** `?view=map` — see `ListingsViewMode`'s own doc comment for why this is
   *  parsed independently of `ListingsFilter`/`parseFiltersFromParams()`.
   *  Absent/unrecognised ⇒ `'list'`. */
  protected readonly viewMode = toSignal(
    this.route.queryParamMap.pipe(
      map((params): ListingsViewMode => (params.get('view') === 'map' ? 'map' : 'list')),
    ),
    { initialValue: 'list' as ListingsViewMode },
  );

  protected readonly activeSortOption = computed(() =>
    SORT_OPTIONS.find(o => o.value === this.sortBy()) ?? null
  );

  private readonly itemsSignal = this.store.selectSignal(selectListingItems);
  private readonly hasMoreSignal = this.store.selectSignal(selectListingsHasMore);
  private readonly filtersSignal = this.store.selectSignal(selectListingsFilters);
  /**
   * Read ONLY to decide whether the radius chip (below) is honest to show —
   * `originCoords` is session-only and never round-trips through the URL
   * (Maps P2-3), so a page reload with `?radiusKm=…` in the URL but no
   * origin in memory yet is an expected, recoverable state (see
   * `activeFilterChips` below), not an error.
   */
  private readonly originCoordsSignal = this.store.selectSignal(selectListingsOriginCoords);
  protected readonly categoriesSignal = this.store.selectSignal(selectListingCategories);

  // Anonymous, unchanging reference data — same treatment as `categoriesSignal`
  // would get if categories weren't already in NgRx, and identical to how
  // `ListingsFiltersComponent` (the mobile filter sheet) loads the SAME
  // `getDistricts()` stream: no second copy of state, just two components
  // reading the same anonymous endpoint independently, same as the codebase
  // already does for categories vs. this page vs. the create-listing wizard.
  private readonly districtsSignal = toSignal(
    this.listingsApi.getDistricts().pipe(
      startWith<ListingDistrict[]>([]),
      catchError(() => of<ListingDistrict[]>([])),
    ),
    { initialValue: [] as ListingDistrict[] },
  );

  protected readonly districtOptions = computed(() => {
    const lang = this.languageService.current().code;
    return this.districtsSignal().map((d) => ({ id: d.id, label: districtDisplayName(d, lang) }));
  });

  protected readonly activeCategoryId = computed(() => this.filtersSignal().categoryId);
  protected readonly activeAgeGroup   = computed(() => this.filtersSignal().ageGroup);
  protected readonly activeRadiusKm = computed(() => this.filtersSignal().radiusKm);
  /** `RadiusOriginFilterComponent` works in METRES (its slider math is
   *  metre-based) — converts at this component's own boundary since
   *  `ListingsFilter.radiusKm` stores fractional km. */
  protected readonly activeRadiusMeters = computed(() => {
    const km = this.activeRadiusKm();
    return km != null ? kmToMeters(km) : null;
  });
  protected readonly activeMinPrice   = computed(() => this.filtersSignal().minPrice);
  protected readonly activeMaxPrice   = computed(() => this.filtersSignal().maxPrice);
  protected readonly activeDistrictIds = computed(() => this.filtersSignal().districtIds);

  protected readonly ageGroups  = AGE_GROUPS;

  protected readonly activeCategoryName = computed(() => {
    const id = this.filtersSignal().categoryId;
    if (!id) return null;
    return this.categoriesSignal().find((c) => c.id === id)?.name ?? null;
  });

  protected readonly activeQuery = computed(() => this.filtersSignal().query ?? '');

  protected readonly hasSidebarFilters = computed(() => {
    const f = this.filtersSignal();
    return !!(
      f.categoryId ||
      f.ageGroup ||
      f.minPrice != null ||
      f.maxPrice != null ||
      f.radiusKm != null ||
      f.districtIds.length > 0
    );
  });

  private readonly localeTag = computed(() => localeTagForLanguage(this.languageService.current().code));

  protected readonly activeFilterChips = computed(() => {
    const f = this.filtersSignal();
    const chips: ActiveFilterChip[] = [];
    if (f.categoryId) {
      const cat = this.categoriesSignal().find((c) => c.id === f.categoryId);
      chips.push({ key: 'categoryId', label: cat?.name ?? f.categoryId });
    }
    if (f.ageGroup) {
      const ag = AGE_GROUPS.find((a) => a.value === f.ageGroup);
      chips.push({ key: 'ageGroup', label: ag?.label ?? f.ageGroup });
    }
    // Gated on `originCoordsSignal()`, not just `f.radiusKm` — see that
    // field's own doc comment. Showing this chip with no origin in memory
    // (e.g. right after a page reload) would claim a filter is narrowing
    // results when the API request actually omitted it entirely
    // (`ListingsApiService.buildListingsQueryParams` only sends `radiusKm`/
    // `originLat`/`originLng` together). The radius VALUE itself is not
    // lost — `RadiusOriginFilterComponent`'s slider still shows it, greyed
    // out with "set a point first" — it just isn't presented as active
    // until an origin exists again.
    if (f.radiusKm != null && this.originCoordsSignal() !== null) {
      const distanceLabel = formatDistanceMeters(kmToMeters(f.radiusKm), this.localeTag(), {
        meters: this.translate.instant('listings.filters.distance.unitMeters'),
        kilometers: this.translate.instant('listings.filters.distance.unitKilometers'),
      });
      chips.push({
        key: 'radiusKm',
        label: `${distanceLabel} · ${this.translate.instant('listings.filters.distance.chipSuffix')}`,
      });
    }
    for (const districtId of f.districtIds) {
      const district = this.districtOptions().find((d) => d.id === districtId);
      chips.push({ key: 'districtId', label: district?.label ?? districtId, districtId });
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

  /** The List/Map toggle — merges `view` into the URL like every other
   *  control on this page, rather than owning local state, so the mode
   *  survives a reload/share the same way filters already do. `'list'`
   *  clears the param entirely instead of writing `view=list`, keeping the
   *  URL clean for the page's default mode. */
  protected setViewMode(mode: ListingsViewMode): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: mode === 'map' ? 'map' : null },
      queryParamsHandling: 'merge',
    });
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

  /**
   * Handles `RadiusOriginFilterComponent`'s `radiusMetersChange` — the
   * component owns the origin (geolocation/manual-pick/denied) UI and
   * dispatch itself (identical on both surfaces), but leaves the RADIUS
   * value's commit timing to the parent: the desktop sidebar applies
   * immediately (merge-navigates, like every other sidebar control here),
   * while the mobile sheet stages it in a draft instead (see
   * `listings-filters.component.ts`).
   */
  protected onRadiusMetersChange(meters: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { radiusKm: serializeRadiusKmParam(metersToKm(meters)) },
      queryParamsHandling: 'merge',
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

  protected removeFilterChip(chip: ActiveFilterChip): void {
    if (chip.key === 'districtId') {
      const current = this.filtersSignal().districtIds;
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          districtIds: serializeDistrictIdsParam(current.filter((id) => id !== chip.districtId)),
        },
        queryParamsHandling: 'merge',
      });
      return;
    }

    const paramKey =
      chip.key === 'categoryId' ? 'categoryId' :
      chip.key === 'city'       ? 'city'       :
      chip.key === 'minPrice'   ? 'minPrice'   :
      chip.key === 'maxPrice'   ? 'maxPrice'   :
      chip.key === 'ageGroup'   ? 'ageGroup'   :
      chip.key === 'radiusKm'   ? 'radiusKm'   :
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

  /**
   * Toggles one district checkbox in the desktop sidebar. Shares the exact
   * same `districtIds: string[]` filter field, `districtIds` URL param, and
   * store slice as the mobile filter sheet's multiselect
   * (`ListingsFiltersComponent`) — there is no second copy of this state, so
   * a selection made here survives a resize down to mobile and back.
   */
  protected selectDistrictFromSidebar(id: string): void {
    const current = this.filtersSignal().districtIds;
    const next = current.includes(id)
      ? current.filter((existing) => existing !== id)
      : [...current, id];
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { districtIds: serializeDistrictIdsParam(next) },
      queryParamsHandling: 'merge',
    });
  }

  private parseFiltersFromParams(params: ParamMap): ListingsFilter {
    const q = params.get('q');
    const city = params.get('city');
    const categoryId = params.get('categoryId');
    const minPriceStr = params.get('minPrice');
    const maxPriceStr = params.get('maxPrice');
    const ageGroup = params.get('ageGroup');
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
      radiusKm: parseRadiusKmParam(params.get('radiusKm')),
      districtIds: parseDistrictIdsParam(params.get('districtIds')),
    };
  }
}
