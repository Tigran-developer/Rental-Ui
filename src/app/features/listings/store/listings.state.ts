import type { ListingDetails } from '../models/listing-details.model';
import type { ListingCategoryOption } from '../models/create-listing.model';
import type { ListingPreview } from '../models/listing.model';
import type { ListingsFilter, ListingsOriginCoords } from '../models/listings-filter.model';

export interface ListingsState {
  items: ListingPreview[];
  selectedListing: ListingDetails | null;
  filters: ListingsFilter;
  /**
   * Renter's device position, cached for the session once granted (see
   * ListingsPageComponent.selectDistance). Not part of `filters` on purpose —
   * it must never round-trip through the URL/query params (Maps P2-3).
   */
  originCoords: ListingsOriginCoords | null;
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
    maxDistance: null,
  },
  originCoords: null,
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
