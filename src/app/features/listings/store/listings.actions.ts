import { createAction, props } from '@ngrx/store';

import type {
  CreateListingRequest,
  CreateListingResponse,
  ListingCategoryOption,
} from '../models/create-listing.model';
import type { ListingDetails } from '../models/listing-details.model';
import type { ListingMapPinsResult } from '../models/listing-map-pin.model';
import type { ListingPreview } from '../models/listing.model';
import type {
  ListingsFilter,
  ListingsOriginCoords,
  ListingsOriginSource,
} from '../models/listings-filter.model';
import type { MapPinsBounds } from '../models/map-pins-bounds.model';

export const loadListings = createAction('[Listings] Load Listings');

export const loadListingsSuccess = createAction(
  '[Listings] Load Listings Success',
  props<{
    items: ListingPreview[];
    page: number;
    pageSize: number;
    hasMore: boolean;
  }>(),
);

export const loadListingsFailure = createAction(
  '[Listings] Load Listings Failure',
  props<{ error: string }>(),
);

export const loadNextPage = createAction('[Listings] Load Next Page');

export const updateFilters = createAction(
  '[Listings] Update Filters',
  props<{ filters: ListingsFilter }>(),
);

export const resetListings = createAction('[Listings] Reset Listings');

/**
 * Caches the renter's reference point for the session so the radius filter
 * can be honored without re-prompting. Dispatched after the browser grants
 * geolocation permission OR the visitor confirms a point in the location
 * picker (see `RadiusOriginFilterComponent`) — never persisted. Also clears
 * `originDenied`, regardless of `source` — a successful manual pick after a
 * geolocation denial is exactly the recovery path design decision #5
 * describes.
 */
export const setOriginCoords = createAction(
  '[Listings] Set Origin Coords',
  props<{ coords: ListingsOriginCoords; source: ListingsOriginSource }>(),
);

/**
 * Marks that a geolocation request failed/was denied while no origin is set
 * yet — drives the radius filter's soft "denied" state (design decision #5).
 * Cleared implicitly the next time `setOriginCoords` succeeds by any means.
 */
export const setOriginDenied = createAction('[Listings] Set Origin Denied');

export const loadListingDetails = createAction(
  '[Listings] Load Listing Details',
  props<{ id: string }>(),
);

export const loadListingDetailsSuccess = createAction(
  '[Listings] Load Listing Details Success',
  props<{ listing: ListingDetails }>(),
);

export const loadListingDetailsFailure = createAction(
  '[Listings] Load Listing Details Failure',
  props<{ error: string }>(),
);

export const toggleFavoriteOptimistic = createAction(
  '[Listings] Toggle Favorite Optimistic',
  props<{ listingId: string }>(),
);

export const toggleFavoriteRollback = createAction(
  '[Listings] Toggle Favorite Rollback',
  props<{ listingId: string; isFavorite: boolean }>(),
);

export const loadListingCategories = createAction(
  '[Listings] Load Listing Categories',
);

export const loadListingCategoriesSuccess = createAction(
  '[Listings] Load Listing Categories Success',
  props<{ categories: ListingCategoryOption[] }>(),
);

export const loadListingCategoriesFailure = createAction(
  '[Listings] Load Listing Categories Failure',
  props<{ error: string }>(),
);

export const createListing = createAction(
  '[Listings] Create Listing',
  props<{ payload: CreateListingRequest; files: File[] }>(),
);

export const createListingSuccess = createAction(
  '[Listings] Create Listing Success',
  props<{ response: CreateListingResponse; imageUploadError: string | null }>(),
);

export const createListingFailure = createAction(
  '[Listings] Create Listing Failure',
  props<{ error: string }>(),
);

export const setImageUploadProgress = createAction(
  '[Listings] Set Image Upload Progress',
  props<{ progress: number }>(),
);

export const retryImageUpload = createAction(
  '[Listings] Retry Image Upload',
  props<{ listingId: string; files: File[] }>(),
);

export const retryImageUploadSuccess = createAction(
  '[Listings] Retry Image Upload Success',
);

export const retryImageUploadFailure = createAction(
  '[Listings] Retry Image Upload Failure',
  props<{ error: string }>(),
);

export const clearCreateListingState = createAction(
  '[Listings] Clear Create Listing State',
);

/**
 * Maps P2-2: fetches catalog map pins for `bounds` (the current map viewport)
 * combined with the existing `ListingsState.filters`/`originCoords` — UNLESS
 * `scope: 'all'` (listing-detail maps, later increment), which fetches with
 * NO filter and NO origin regardless of what's currently in the store (see
 * `ListingsEffects.loadMapPins$`): a listing-detail page must show every
 * toy, not whatever the visitor last searched for on `/listings`. `'filtered'`
 * is today's (and the catalogue map's) only behaviour. `bounds: null` is
 * valid — the effect omits the viewport box entirely rather than sending a
 * degenerate one (mirrors `ListingsApiService.getMapPins`'s all-or-nothing
 * contract). Dispatched on every pan/zoom, so the effect must `switchMap`
 * (not `mergeMap`/`concatMap`) to cancel a stale in-flight request.
 */
export const loadMapPins = createAction(
  '[Listings] Load Map Pins',
  props<{ bounds: MapPinsBounds | null; scope: 'filtered' | 'all' }>(),
);

export const loadMapPinsSuccess = createAction(
  '[Listings] Load Map Pins Success',
  props<{ result: ListingMapPinsResult }>(),
);

export const loadMapPinsFailure = createAction(
  '[Listings] Load Map Pins Failure',
  props<{ error: string }>(),
);
