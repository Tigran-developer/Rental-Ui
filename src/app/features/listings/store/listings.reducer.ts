import { createReducer, on } from '@ngrx/store';

import * as FavoritesActions from '../../favorites/store/favorites.actions';
import type { ListingDetails } from '../models/listing-details.model';
import type { ListingPreview } from '../models/listing.model';
import * as ListingsActions from './listings.actions';
import { initialListingsState, type ListingsState } from './listings.state';

export const listingsFeatureKey = 'listings' as const;

function toggleFavoriteOnDetails(
  listing: ListingDetails | null,
  listingId: string,
): ListingDetails | null {
  if (listing === null || listing.id !== listingId) {
    return listing;
  }
  return { ...listing, isFavorite: !listing.isFavorite };
}

function setFavoriteOnDetails(
  listing: ListingDetails | null,
  listingId: string,
  isFavorite: boolean,
): ListingDetails | null {
  if (listing === null || listing.id !== listingId) {
    return listing;
  }
  return { ...listing, isFavorite };
}

function mapItemsToggleFavorite(
  items: ListingPreview[],
  listingId: string,
): ListingPreview[] {
  return items.map((item) =>
    item.id === listingId ? { ...item, isFavorite: !item.isFavorite } : item,
  );
}

function mapItemsSetFavorite(
  items: ListingPreview[],
  listingId: string,
  isFavorite: boolean,
): ListingPreview[] {
  return items.map((item) =>
    item.id === listingId ? { ...item, isFavorite } : item,
  );
}

export const listingsReducer = createReducer(
  initialListingsState,
  on(
    ListingsActions.loadListings,
    (state): ListingsState => ({
      ...state,
      isLoading: true,
      error: null,
    }),
  ),
  on(
    ListingsActions.loadNextPage,
    (state): ListingsState => ({
      ...state,
      isLoading: true,
      error: null,
    }),
  ),
  on(
    ListingsActions.loadListingsSuccess,
    (state, { items, page, pageSize, hasMore }): ListingsState => ({
      ...state,
      items: page <= 1 ? [...items] : [...state.items, ...items],
      page,
      pageSize,
      hasMore,
      isLoading: false,
      error: null,
    }),
  ),
  on(
    ListingsActions.loadListingsFailure,
    (state, { error }): ListingsState => ({
      ...state,
      isLoading: false,
      error,
    }),
  ),
  on(
    ListingsActions.updateFilters,
    (state, { filters }): ListingsState => ({
      ...state,
      filters: { ...filters },
      page: 1,
      items: [],
      hasMore: false,
      error: null,
    }),
  ),
  on(
    ListingsActions.resetListings,
    (): ListingsState => ({
      ...initialListingsState,
      filters: { ...initialListingsState.filters },
    }),
  ),
  on(
    ListingsActions.setOriginCoords,
    (state, { coords }): ListingsState => ({
      ...state,
      originCoords: coords,
    }),
  ),
  on(
    ListingsActions.loadListingDetails,
    (state): ListingsState => ({
      ...state,
      isDetailsLoading: true,
      error: null,
    }),
  ),
  on(
    ListingsActions.loadListingDetailsSuccess,
    (state, { listing }): ListingsState => ({
      ...state,
      selectedListing: listing,
      isDetailsLoading: false,
      error: null,
    }),
  ),
  on(
    ListingsActions.loadListingDetailsFailure,
    (state, { error }): ListingsState => ({
      ...state,
      isDetailsLoading: false,
      error,
    }),
  ),
  on(
    ListingsActions.toggleFavoriteOptimistic,
    (state, { listingId }): ListingsState => ({
      ...state,
      items: mapItemsToggleFavorite(state.items, listingId),
      selectedListing: toggleFavoriteOnDetails(state.selectedListing, listingId),
    }),
  ),
  on(
    ListingsActions.toggleFavoriteRollback,
    (state, { listingId, isFavorite }): ListingsState => ({
      ...state,
      items: mapItemsSetFavorite(state.items, listingId, isFavorite),
      selectedListing: setFavoriteOnDetails(
        state.selectedListing,
        listingId,
        isFavorite,
      ),
    }),
  ),
  on(
    ListingsActions.loadListingCategories,
    (state): ListingsState => ({
      ...state,
      categoriesLoading: true,
      error: null,
    }),
  ),
  on(
    ListingsActions.loadListingCategoriesSuccess,
    (state, { categories }): ListingsState => ({
      ...state,
      categories: [...categories],
      categoriesLoading: false,
      error: null,
    }),
  ),
  on(
    ListingsActions.loadListingCategoriesFailure,
    (state, { error }): ListingsState => ({
      ...state,
      categoriesLoading: false,
      error,
    }),
  ),
  on(
    ListingsActions.createListing,
    (state): ListingsState => ({
      ...state,
      createListingLoading: true,
      createListingError: null,
      createListingSuccessId: null,
      createListingImageUploadError: null,
      createListingImageUploadProgress: null,
    }),
  ),
  on(
    ListingsActions.createListingSuccess,
    (state, { response, imageUploadError }): ListingsState => ({
      ...state,
      createListingLoading: false,
      createListingError: null,
      createListingSuccessId: response.id,
      createListingImageUploadError: imageUploadError,
      createListingImageUploadProgress: null,
    }),
  ),
  on(
    ListingsActions.createListingFailure,
    (state, { error }): ListingsState => ({
      ...state,
      createListingLoading: false,
      createListingError: error,
      createListingSuccessId: null,
      createListingImageUploadError: null,
      createListingImageUploadProgress: null,
    }),
  ),
  on(
    ListingsActions.setImageUploadProgress,
    (state, { progress }): ListingsState => ({
      ...state,
      createListingImageUploadProgress: progress,
    }),
  ),
  on(
    ListingsActions.retryImageUpload,
    (state): ListingsState => ({
      ...state,
      createListingImageUploadError: null,
      createListingImageUploadProgress: 0,
    }),
  ),
  on(
    ListingsActions.retryImageUploadSuccess,
    (state): ListingsState => ({
      ...state,
      createListingImageUploadError: null,
      createListingImageUploadProgress: null,
    }),
  ),
  on(
    ListingsActions.retryImageUploadFailure,
    (state, { error }): ListingsState => ({
      ...state,
      createListingImageUploadError: error,
      createListingImageUploadProgress: null,
    }),
  ),
  on(
    ListingsActions.clearCreateListingState,
    (state): ListingsState => ({
      ...state,
      createListingLoading: false,
      createListingError: null,
      createListingSuccessId: null,
      createListingImageUploadError: null,
      createListingImageUploadProgress: null,
    }),
  ),
  on(
    FavoritesActions.removeFavoriteOptimistic,
    (state, { listingId }): ListingsState => ({
      ...state,
      items: mapItemsSetFavorite(state.items, listingId, false),
      selectedListing: setFavoriteOnDetails(state.selectedListing, listingId, false),
    }),
  ),
  on(
    FavoritesActions.removeFavoriteFailure,
    (state, { listingId }): ListingsState => ({
      ...state,
      items: mapItemsSetFavorite(state.items, listingId, true),
      selectedListing: setFavoriteOnDetails(state.selectedListing, listingId, true),
    }),
  ),
);
