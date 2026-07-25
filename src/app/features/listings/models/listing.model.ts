export interface ListingPreview {
  id: string;
  title: string;
  city: string;
  pricePerDay: number;
  mainImageUrl: string | null;
  isFavorite: boolean;
  /** Trust fields when returned by list/favorites APIs. */
  ageFromMonths?: number | null;
  ageToMonths?: number | null;
  condition?: string | null;
  hygieneNotes?: string | null;
  /** Average toy rating, or null when below the aggregate threshold. */
  rating?: number | null;
  reviewCount?: number;
  /** Availability status returned by user-listings and my-listings APIs. */
  listingStatus?: 'available' | 'rented' | null;
  /** Owner user ID — present when returned by the listings browse API. */
  ownerId?: string | null;
  /**
   * Straight-line distance from the renter's reference point, in
   * kilometres — populated by `GET /api/listings` ONLY when the request
   * included `originLat`/`originLng` (Maps P2 "location + radius" design;
   * backend commit `d0955e0`). `null`/absent otherwise, including when no
   * origin was supplied. Drives the `.distbadge` pill on the catalog card
   * (`ListingCardComponent`) — never recomputed client-side.
   */
  distanceKm?: number | null;
}

export interface ListingImage {
  id: string;
  url: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface ListingOwner {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
}

export interface BookedDateRange {
  startDate: string;
  endDate: string;
}
