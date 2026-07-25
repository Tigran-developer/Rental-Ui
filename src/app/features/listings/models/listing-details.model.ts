import type { BookedDateRange, ListingImage, ListingOwner } from './listing.model';
import type { DeliveryType } from './create-listing.model';
import type { ListingDistrict } from './district.model';

/**
 * Canonical set of toy conditions. This is the single source of truth shared
 * across listings, create/edit, and admin moderation. The admin API service
 * narrows untrusted backend strings to this union via a runtime guard.
 */
export type ToyCondition = 'New' | 'LikeNew' | 'Good' | 'Fair' | 'Poor';

export interface ListingDetails {
  id: string;
  title: string;
  description: string;
  city: string;
  pricePerDay: number;
  images: ListingImage[];
  owner: ListingOwner;
  bookedDates: BookedDateRange[];
  isFavorite: boolean;

  // Optional toy-specific fields. May be omitted by the backend.
  ageFromMonths?: number | null;
  ageToMonths?: number | null;
  condition?: ToyCondition | null;
  hygieneNotes?: string | null;
  safetyNotes?: string | null;
  depositAmount?: number | null;
  minRentalDays?: number | null;
  deliveryType?: DeliveryType | null;

  /**
   * !! PRIVACY-SENSITIVE — READ BEFORE USING !!
   *
   * `latitude`/`longitude` do NOT mean the same thing for every caller, and the
   * *shape* (nullable decimal pair) gives you no way to tell which meaning you got:
   *
   * - Listing owner and Admin callers: the EXACT point the owner set.
   * - Every other caller (including anonymous): the CENTROID of the geohash-**7**
   *   cell containing that point (~117 x 153 m at Yerevan's latitude — bumped
   *   from geohash-6's ~0.93 x 0.61 km on 2026-07-25, see `GeohashSnapper` in
   *   rental-api and the `2026-07-25-geohash-precision-and-radius-circle`
   *   feature note) — never the real point. Treat this as an approximate area
   *   marker only; never render it as "the address", never use it for anything
   *   precision-sensitive (routing, distance-to-the-meter, etc).
   *
   * `null` does NOT reliably mean "owner set no location" — it can also occur for
   * other reasons upstream (e.g. the snapping computation had nothing to snap).
   * Do not infer "no location on file" from null; if you need that, check for the
   * absence of `district` too, and prefer showing the district name over reasoning
   * about the coordinates being null.
   *
   * Backend: `ListingDetailsResponse.Latitude`/`Longitude` — see
   * `ListingsQueryService.GetApprovedListingByIdAsync` (`CanSeeExactCoordinates`) and
   * `GeohashSnapper` in rental-api for the exact snapping behaviour (P1-2/P1-3).
   */
  latitude?: number | null;
  longitude?: number | null;

  /**
   * The Yerevan district the listing's exact point resolved to (point-in-polygon),
   * or the owner's explicit override. Unlike latitude/longitude above, this is NOT
   * gated by caller identity — every caller sees the same value. `null` when the
   * exact point falls outside all 12 known districts (legal — e.g. a listing
   * outside Yerevan) or when the listing has no coordinates at all.
   */
  district?: ListingDistrict | null;
}
