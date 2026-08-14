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
import type {
  AdminListingDetail,
  AdminListingSummary,
} from '../app/features/admin/models/admin-listing-queue.model';
import type { AdminCategory } from '../app/features/admin/models/admin-category.model';
import type {
  AdminUser,
  AdminUserQueue,
  AdminUserQueueSummary,
} from '../app/features/admin/models/admin-user.model';
import type {
  AdminReportQueue,
  AdminReportQueueCounts,
  AdminReportRow,
} from '../app/features/admin/models/admin-report.model';
import type {
  AdminActivityItem,
  AdminOverview,
} from '../app/features/admin/models/admin-overview.model';
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

export function makeListingPreview(overrides: Partial<ListingPreview> = {}): ListingPreview {
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

export function makeListingDetails(overrides: Partial<ListingDetails> = {}): ListingDetails {
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

export function makeListingMapPin(overrides: Partial<ListingMapPin> = {}): ListingMapPin {
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

export function makeBookingRequest(overrides: Partial<BookingRequest> = {}): BookingRequest {
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

export function makeBookingDetail(overrides: Partial<BookingDetail> = {}): BookingDetail {
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

export function makeAdminListingSummary(
  overrides: Partial<AdminListingSummary> = {},
): AdminListingSummary {
  return {
    id: 'pending-1',
    ownerId: 'owner-1',
    ownerEmail: 'owner@example.com',
    ownerFirstName: 'Anahit',
    ownerLastName: 'Owner',
    categoryId: 'cat-1',
    categoryName: 'Wooden Toys',
    title: 'Toy Kitchen',
    description: 'A play kitchen',
    pricePerDay: 4,
    currency: 'AMD',
    country: 'Armenia',
    city: 'Yerevan',
    addressLine: null,
    ageFromMonths: 36,
    ageToMonths: 84,
    condition: 'Good',
    hygieneNotes: 'Wiped down between rentals.',
    safetyNotes: 'No small parts.',
    depositAmount: null,
    images: [],
    createdAt: '2026-06-20T10:00:00.000Z',
    photoCount: 3,
    primaryImageUrl: null,
    rejectionReasonCode: null,
    rejectionNote: null,
    moderatedAt: null,
    ownerAvatarUrl: null,
    ownerIsIdConfirmed: true,
    ownerRating: 4.8,
    ownerReviewCount: 12,
    ownerListingCount: 3,
    ownerCompletedRentals: 9,
    ownerJoinedAt: '2025-01-10T00:00:00.000Z',
    suggestedCategoryId: null,
    suggestedCategoryName: null,
    ...overrides,
  };
}

export function makeAdminListingDetail(
  overrides: Partial<AdminListingDetail> = {},
): AdminListingDetail {
  return {
    ...makeAdminListingSummary(),
    status: 'PendingApproval',
    ownerOpenReportCount: 0,
    ...overrides,
  };
}

export function makeAdminOverview(overrides: Partial<AdminOverview> = {}): AdminOverview {
  return {
    awaitingReviewCount: 5,
    oldestAwaitingCreatedAt: '2026-08-11T10:00:00.000Z',
    liveListingCount: 1724,
    liveListingsAddedThisWeek: 38,
    categoryCount: 10,
    visibleCategoryCount: 9,
    openReportCount: 2,
    averageReviewTimeMinutes: 192,
    reviewTimeTargetHours: 6,
    ...overrides,
  };
}

export function makeAdminActivityItem(
  overrides: Partial<AdminActivityItem> = {},
): AdminActivityItem {
  return {
    id: 'log-1',
    action: 'ListingApproved',
    targetType: 'Listing',
    targetId: 'listing-1',
    targetLabel: 'STEM discovery lab kit',
    createdAt: '2026-08-13T09:48:00.000Z',
    actorId: 'user-1',
    actorFirstName: 'Sona',
    actorLastName: 'K.',
    actorAvatarUrl: null,
    detailJson: null,
    ...overrides,
  };
}

export function makeAdminCategory(overrides: Partial<AdminCategory> = {}): AdminCategory {
  return {
    id: 'cat-1',
    name: 'Ride-ons',
    slug: 'ride-ons',
    iconName: 'truck',
    colorHex: '#D9E8FF',
    displayOrder: 0,
    isVisible: true,
    listingCount: 0,
    ...overrides,
  };
}

export function makeAdminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'user-1',
    email: 'anahit@toyrent.am',
    firstName: 'Anahit',
    lastName: 'Grigoryan',
    avatarUrl: null,
    role: 'User',
    status: 'Active',
    isIdConfirmed: true,
    marketplaceRole: 'Owner',
    listingCount: 5,
    rentalCount: 2,
    flagCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeAdminUserQueueSummary(
  overrides: Partial<AdminUserQueueSummary> = {},
): AdminUserQueueSummary {
  return {
    totalUsers: 0,
    verifiedCount: 0,
    pendingCount: 0,
    suspendedCount: 0,
    ...overrides,
  };
}

export function makeAdminUserQueue(overrides: Partial<AdminUserQueue> = {}): AdminUserQueue {
  return {
    items: [],
    page: 1,
    pageSize: 20,
    totalCount: 0,
    totalPages: 0,
    summary: makeAdminUserQueueSummary(),
    ...overrides,
  };
}

export function makeAdminReportRow(overrides: Partial<AdminReportRow> = {}): AdminReportRow {
  return {
    id: 'report-1',
    targetType: 'Listing',
    targetId: 'listing-1',
    targetLabel: 'Wooden balance bike',
    targetImageUrl: null,
    reasonCode: 'unsafeItem',
    detail: 'The wheel is loose.',
    severity: 'High',
    status: 'Open',
    createdAt: '2026-08-01T00:00:00Z',
    reporterId: 'user-2',
    reporterFirstName: 'Anahit',
    reporterLastName: 'Grigoryan',
    reporterEmail: 'anahit@toyrent.am',
    reporterAvatarUrl: null,
    resolvedAt: null,
    resolutionNote: null,
    ...overrides,
  };
}

export function makeAdminReportQueueCounts(
  overrides: Partial<AdminReportQueueCounts> = {},
): AdminReportQueueCounts {
  return {
    open: 0,
    resolved: 0,
    dismissed: 0,
    all: 0,
    ...overrides,
  };
}

export function makeAdminReportQueue(overrides: Partial<AdminReportQueue> = {}): AdminReportQueue {
  return {
    items: [],
    page: 1,
    pageSize: 20,
    totalCount: 0,
    totalPages: 0,
    counts: makeAdminReportQueueCounts(),
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
