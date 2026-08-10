/**
 * Fixture builders for tests. Each returns a fully-valid model with sensible
 * defaults; pass a partial to override only the fields a given test cares about.
 *
 * Keep these in sync with the real model interfaces — a fixture that drifts from
 * the production shape silently weakens every test that depends on it.
 */
import type { CurrentUser } from '../app/features/auth/models/auth.models';
import type {
  BookingDetail,
  BookingRequest,
  MyBooking,
} from '../app/features/bookings/models/booking.model';
import type { ListingPreview } from '../app/features/listings/models/listing.model';
import type { ListingMapPin } from '../app/features/listings/models/listing-map-pin.model';
import type { ListingDetails } from '../app/features/listings/models/listing-details.model';
import type { PendingListing } from '../app/features/admin/models/pending-listing.model';
import type { BookingReviewStatus } from '../app/features/reviews/models/review.model';

export function makeUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    roles: ['User'],
    ...overrides,
  };
}

export function makeAdmin(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return makeUser({ id: 'admin-1', roles: ['User', 'Admin'], ...overrides });
}

export function makeListingPreview(
  overrides: Partial<ListingPreview> = {},
): ListingPreview {
  return {
    id: 'listing-1',
    title: 'Wooden Train Set',
    city: 'Yerevan',
    pricePerDay: 5,
    mainImageUrl: null,
    isFavorite: false,
    ...overrides,
  };
}

export function makeListingDetails(
  overrides: Partial<ListingDetails> = {},
): ListingDetails {
  return {
    id: 'listing-1',
    title: 'Wooden Train Set',
    description: 'A lovely wooden train set.',
    city: 'Yerevan',
    pricePerDay: 5,
    images: [],
    owner: {
      id: 'owner-1',
      firstName: 'Owen',
      lastName: 'Owner',
      phoneNumber: null,
    },
    bookedDateRanges: [],
    isFavorite: false,
    category: null,
    ageFromMonths: null,
    ageToMonths: null,
    condition: null,
    hygieneNotes: null,
    safetyNotes: null,
    depositAmount: null,
    minRentalDays: null,
    deliveryType: null,
    latitude: null,
    longitude: null,
    district: null,
    ...overrides,
  };
}

export function makeListingMapPin(
  overrides: Partial<ListingMapPin> = {},
): ListingMapPin {
  return {
    id: 'listing-1',
    latitude: 40.1,
    longitude: 44.5,
    title: 'Wooden Train Set',
    pricePerDay: 5,
    priceUnit: 'Daily',
    currency: 'AMD',
    primaryImageUrl: null,
    rating: null,
    reviewCount: 0,
    ...overrides,
  };
}

export function makeMyBooking(overrides: Partial<MyBooking> = {}): MyBooking {
  return {
    id: 'booking-1',
    listingId: 'listing-1',
    listingTitle: 'Wooden Train Set',
    listingPrimaryImageUrl: null,
    ownerFirstName: 'Owen',
    ownerLastName: 'Owner',
    startDate: '2026-07-01',
    endDate: '2026-07-03',
    totalPrice: 15,
    status: 'Pending',
    createdAt: '2026-06-20T10:00:00.000Z',
    ...overrides,
  };
}

export function makeBookingRequest(
  overrides: Partial<BookingRequest> = {},
): BookingRequest {
  return {
    id: 'booking-1',
    listingId: 'listing-1',
    listingTitle: 'Wooden Train Set',
    renterId: 'renter-1',
    renterFirstName: 'Rena',
    renterLastName: 'Renter',
    renterEmail: 'rena@example.com',
    renterPhoneNumber: null,
    startDate: '2026-07-01',
    endDate: '2026-07-03',
    totalPrice: 15,
    status: 'PendingApproval',
    createdAt: '2026-06-20T10:00:00.000Z',
    note: null,
    ...overrides,
  };
}

export function makeBookingDetail(
  overrides: Partial<BookingDetail> = {},
): BookingDetail {
  return {
    id: 'booking-1',
    status: 'Approved',
    role: 'owner',
    listingId: 'listing-1',
    listingTitle: 'Wooden Train Set',
    listingPrimaryImageUrl: null,
    categoryName: 'Toys',
    condition: 'Good',
    city: 'Yerevan',
    country: 'Armenia',
    addressLine: null,
    currency: 'AMD',
    pricePerDay: 5,
    depositAmount: null,
    totalPrice: 15,
    startDate: '2026-07-01',
    endDate: '2026-07-03',
    createdAt: '2026-06-20T10:00:00.000Z',
    approvedAt: '2026-06-21T10:00:00.000Z',
    activeAt: null,
    completedAt: null,
    expiresAt: null,
    rejectionReason: null,
    note: null,
    counterpartyId: 'user-2',
    counterpartyFirstName: 'Rena',
    counterpartyLastName: 'Renter',
    counterpartyAvatarUrl: null,
    counterpartyPhoneNumber: null,
    ...overrides,
  };
}

export function makePendingListing(
  overrides: Partial<PendingListing> = {},
): PendingListing {
  return {
    id: 'pending-1',
    title: 'Toy Kitchen',
    description: 'A play kitchen',
    city: 'Yerevan',
    country: 'Armenia',
    categoryName: 'Toys',
    pricePerDay: 4,
    depositAmount: null,
    imageUrl: null,
    createdAt: '2026-06-20T10:00:00.000Z',
    owner: null,
    ageFromMonths: null,
    ageToMonths: null,
    condition: null,
    hygieneNotes: null,
    safetyNotes: null,
    ...overrides,
  };
}

export function makeReviewStatus(
  overrides: Partial<BookingReviewStatus> = {},
): BookingReviewStatus {
  return {
    bookingId: 'booking-1',
    role: 'renter',
    isCompleted: true,
    canReviewToy: true,
    canReviewOwner: true,
    canReviewRenter: false,
    hasToyReview: false,
    hasOwnerReview: false,
    hasRenterReview: false,
    ...overrides,
  };
}
