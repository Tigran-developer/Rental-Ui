import type { ListingDetails } from '../models/listing-details.model';
import type { ListingCategoryOption } from '../models/create-listing.model';
import type { ListingPreview } from '../models/listing.model';
import type {
  ListingsFilter,
  ListingsOriginCoords,
  ListingsOriginSource,
} from '../models/listings-filter.model';

export interface ListingsState {
  items: ListingPreview[];
  selectedListing: ListingDetails | null;
  filters: ListingsFilter;
  /**
   * Renter's device position, cached for the session once granted (see
   * `RadiusOriginFilterComponent`). Not part of `filters` on purpose — it
   * must never round-trip through the URL/query params (Maps P2-3).
   */
  originCoords: ListingsOriginCoords | null;
  /** How `originCoords` was obtained — drives the radius filter's origin-summary
   *  copy ("From your location" vs "From the chosen point"). Session-only,
   *  same treatment as `originCoords` itself. `null` iff `originCoords` is. */
  originSource: ListingsOriginSource | null;
  /**
   * `true` after a geolocation request has failed/been denied AND no origin
   * is currently set — drives the radius filter's "denied" state (a soft
   * message + "pick a point on the map" fallback, never a red error; design
   * decision #5). Cleared the moment `originCoords` is set by any means.
   * Session-only, never persisted.
   */
  originDenied: boolean;
  page: number;
  pageSize: number;
  hasMore: boolean;
  isLoading: boolean;
  isDetailsLoading: boolean;
  categories: ListingCategoryOption[];
  categoriesLoading: boolean;
  createListingLoading: boolean;
  createListingError: string | null;
  createListingSuccessId: string | null;
  createListingImageUploadError: string | null;
  createListingImageUploadProgress: number | null;
  error: string | null;
}

export const initialListingsState: ListingsState = {
  items: [],
  selectedListing: null,
  filters: {
    query: null,
    city: null,
    categoryId: null,
    minPrice: null,
    maxPrice: null,
    ageGroup: null,
    radiusKm: null,
    districtIds: [],
  },
  originCoords: null,
  originSource: null,
  originDenied: false,
  page: 1,
  pageSize: 20,
  hasMore: false,
  isLoading: false,
  isDetailsLoading: false,
  categories: [],
  categoriesLoading: false,
  createListingLoading: false,
  createListingError: null,
  createListingSuccessId: null,
  createListingImageUploadError: null,
  createListingImageUploadProgress: null,
  error: null,
};
