import { createFeatureSelector, createSelector } from '@ngrx/store';

import type { ListingCategoryOption } from '../models/create-listing.model';
import type { ListingDetails } from '../models/listing-details.model';
import type { ListingPreview } from '../models/listing.model';
import type { ListingsFilter, ListingsOriginCoords } from '../models/listings-filter.model';
import { listingsFeatureKey } from './listings.reducer';
import type { ListingsState } from './listings.state';

export const selectListingsState =
  createFeatureSelector<ListingsState>(listingsFeatureKey);

export const selectListingItems = createSelector(
  selectListingsState,
  (state: ListingsState): ListingPreview[] => state.items,
);

export const selectSelectedListing = createSelector(
  selectListingsState,
  (state: ListingsState): ListingDetails | null => state.selectedListing,
);

export const selectListingsFilters = createSelector(
  selectListingsState,
  (state: ListingsState): ListingsFilter => state.filters,
);

export const selectListingsOriginCoords = createSelector(
  selectListingsState,
  (state: ListingsState): ListingsOriginCoords | null => state.originCoords,
);

export const selectListingsPage = createSelector(
  selectListingsState,
  (state: ListingsState): number => state.page,
);

export const selectListingsPageSize = createSelector(
  selectListingsState,
  (state: ListingsState): number => state.pageSize,
);

export const selectListingsHasMore = createSelector(
  selectListingsState,
  (state: ListingsState): boolean => state.hasMore,
);

export const selectListingsLoading = createSelector(
  selectListingsState,
  (state: ListingsState): boolean => state.isLoading,
);

export const selectListingDetailsLoading = createSelector(
  selectListingsState,
  (state: ListingsState): boolean => state.isDetailsLoading,
);

export const selectListingsError = createSelector(
  selectListingsState,
  (state: ListingsState): string | null => state.error,
);

export const selectListingCategories = createSelector(
  selectListingsState,
  (state: ListingsState): ListingCategoryOption[] => state.categories,
);

export const selectListingCategoriesLoading = createSelector(
  selectListingsState,
  (state: ListingsState): boolean => state.categoriesLoading,
);

export const selectCreateListingLoading = createSelector(
  selectListingsState,
  (state: ListingsState): boolean => state.createListingLoading,
);

export const selectCreateListingError = createSelector(
  selectListingsState,
  (state: ListingsState): string | null => state.createListingError,
);

export const selectCreateListingSuccessId = createSelector(
  selectListingsState,
  (state: ListingsState): string | null => state.createListingSuccessId,
);

export const selectCreateListingImageUploadError = createSelector(
  selectListingsState,
  (state: ListingsState): string | null => state.createListingImageUploadError,
);

export const selectCreateListingImageUploadProgress = createSelector(
  selectListingsState,
  (state: ListingsState): number | null =>
    state.createListingImageUploadProgress,
);
