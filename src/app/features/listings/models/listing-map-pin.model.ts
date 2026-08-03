import type { PriceUnit } from './create-listing.model';

/**
 * Maps P2-1: minimal shape for a single pin on the (future) map view, served by
 * `GET /api/listings/map-pins` (`ApiContract.listings.mapPins`, `[AllowAnonymous]`,
 * same `ListingsQueryFilter` query params as `GET /api/listings`). Backend:
 * `ListingMapPinResponse`.
 *
 * Consumer: `features/listings/components/listings-map/` (Maps P2-2, in progress).
 *
 * !! `latitude`/`longitude` do NOT mean the same thing here as on `ListingDetails` !!
 *
 * On `ListingDetails` (`listing-details.model.ts`), `latitude`/`longitude` are
 * privileged-gated: the listing owner and Admin get the EXACT point, every other
 * caller gets a fuzzed centroid, and the field-level doc comment there has to spell
 * that out because the shape alone can't. A pin has no such ambiguity: there is no
 * owner/admin-privileged variant of this endpoint at all. `latitude`/`longitude`
 * below are ALWAYS the public (geohash-cell-centroid) pair, for every caller,
 * including the listing's own owner (ADR-008). Never assume a more precise variant
 * exists for a pin the way it does for `ListingDetails` — it doesn't, by design.
 */
export interface ListingMapPin {
  id: string;
  /** Always the public (fuzzed) coordinate — see the type-level doc above. */
  latitude: number;
  /** Always the public (fuzzed) coordinate — see the type-level doc above. */
  longitude: number;
  title: string;
  pricePerDay: number;
  priceUnit: PriceUnit;
  currency: string;
  primaryImageUrl: string | null;
  /**
   * Average toy rating, or `null` below the aggregate threshold — same rule as
   * `ListingPreview.rating`: `null` whenever `reviewCount < 2`, not merely when it
   * is 0. A listing with exactly one review still reports `rating: null` here.
   */
  rating: number | null;
  reviewCount: number;
}

/**
 * Envelope for `GET /api/listings/map-pins`. Backend: `ListingMapPinsResponse`.
 * `isTruncated` marks that the result was cut off at the backend's pin cap, so a
 * future map consumer can prompt "zoom in to see all pins" instead of silently
 * implying the map shows every matching listing.
 */
export interface ListingMapPinsResult {
  items: ListingMapPin[];
  isTruncated: boolean;
}
