/** Minimal wire-shape fixtures for E2E seeds (kept separate from unit fixtures). */
export function e2eListing(overrides: Record<string, unknown> = {}) {
  return {
    id: 'listing-e2e-1',
    title: 'E2E Wooden Train Set',
    city: 'Yerevan',
    pricePerDay: 5,
    mainImageUrl: null,
    isFavorite: false,
    ...overrides,
  };
}

export function e2eUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-e2e-1',
    email: 'user@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    roles: ['User'],
    ...overrides,
  };
}

export function e2eAdmin(overrides: Record<string, unknown> = {}) {
  return e2eUser({ id: 'admin-e2e-1', roles: ['User', 'Admin'], ...overrides });
}

/**
 * The 12 fixed Yerevan districts served by `GET /api/districts`. Ids/codes/
 * names are copied verbatim from the seed data in the
 * `AddDistrictsAndListingLocationFields` migration
 * (rental-api/src/RentalPlatform.Infrastructure/Persistence/Migrations/
 * 20260721072621_AddDistrictsAndListingLocationFields.cs) so this fixture
 * cannot drift from what the real backend returns. Sorted by `nameEn` to
 * match the backend's ordering guarantee (`DistrictsController`).
 */
export function e2eDistricts() {
  const districts = [
    { id: 'd0000001-0000-4000-9000-000000000001', code: 'ajapnyak', nameEn: 'Ajapnyak', nameHy: 'Աջափնյակ', nameRu: 'Ачапняк' },
    { id: 'd0000002-0000-4000-9000-000000000002', code: 'arabkir', nameEn: 'Arabkir', nameHy: 'Արաբկիր', nameRu: 'Арабкир' },
    { id: 'd0000003-0000-4000-9000-000000000003', code: 'avan', nameEn: 'Avan', nameHy: 'Ավան', nameRu: 'Аван' },
    { id: 'd0000004-0000-4000-9000-000000000004', code: 'davtashen', nameEn: 'Davtashen', nameHy: 'Դավթաշեն', nameRu: 'Давташен' },
    { id: 'd0000005-0000-4000-9000-000000000005', code: 'erebuni', nameEn: 'Erebuni', nameHy: 'Էրեբունի', nameRu: 'Эребуни' },
    { id: 'd0000006-0000-4000-9000-000000000006', code: 'kanaker-zeytun', nameEn: 'Kanaker-Zeytun', nameHy: 'Քանաքեռ-Զեյթուն', nameRu: 'Канакер-Зейтун' },
    { id: 'd0000007-0000-4000-9000-000000000007', code: 'kentron', nameEn: 'Kentron', nameHy: 'Կենտրոն', nameRu: 'Кентрон' },
    { id: 'd0000008-0000-4000-9000-000000000008', code: 'malatia-sebastia', nameEn: 'Malatia-Sebastia', nameHy: 'Մալաթիա-Սեբաստիա', nameRu: 'Малатия-Себастия' },
    { id: 'd0000009-0000-4000-9000-000000000009', code: 'nork-marash', nameEn: 'Nork-Marash', nameHy: 'Նորք Մարաշ', nameRu: 'Норк Мараш' },
    { id: 'd000000a-0000-4000-9000-00000000000a', code: 'nor-nork', nameEn: 'Nor Nork', nameHy: 'Նոր Նորք', nameRu: 'Нор Норк' },
    { id: 'd000000b-0000-4000-9000-00000000000b', code: 'nubarashen', nameEn: 'Nubarashen', nameHy: 'Նուբարաշեն', nameRu: 'Нубарашен' },
    { id: 'd000000c-0000-4000-9000-00000000000c', code: 'shengavit', nameEn: 'Shengavit', nameHy: 'Շենգավիթ', nameRu: 'Шенгавит' },
  ];
  return [...districts].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
}

/** One district from `e2eDistricts()` — Kentron by default (central Yerevan). */
export function e2eDistrict(overrides: Record<string, unknown> = {}) {
  const kentron = e2eDistricts().find((d) => d.code === 'kentron');
  return { ...kentron, ...overrides };
}

/**
 * Full `GET /api/listings/:id` wire shape (P1-8/M-013 gap fixture — the mocked
 * tier had never modelled this endpoint before). Defaults to a listing with a
 * real coordinate + district so map/location journeys have something to
 * assert on; pass `{ latitude: null, longitude: null }` for the no-pin state.
 */
export function e2eListingDetails(overrides: Record<string, unknown> = {}) {
  return {
    id: 'listing-e2e-1',
    title: 'E2E Wooden Train Set',
    description: 'A sturdy wooden train set, gently used and freshly cleaned.',
    city: 'Yerevan',
    pricePerDay: 5,
    images: [],
    owner: { id: 'owner-e2e-1', firstName: 'Olive', lastName: 'Owner', phoneNumber: null },
    bookedDates: [],
    isFavorite: false,
    ageFromMonths: 24,
    ageToMonths: 60,
    condition: 'Good',
    hygieneNotes: null,
    safetyNotes: null,
    depositAmount: null,
    minRentalDays: 1,
    deliveryType: 'Pickup',
    district: e2eDistrict(),
    latitude: 40.1872,
    longitude: 44.5152,
    ...overrides,
  };
}

/**
 * One `GET /api/listings/map-pins` item (Maps P2-2). Mirrors
 * `src/testing/fixtures.ts`'s `makeListingMapPin()` defaults (kept separate,
 * same convention as every other fixture here vs. the unit fixtures file) —
 * `latitude`/`longitude` are always the PUBLIC (fuzzed) pair by contract, see
 * `listing-map-pin.model.ts`'s type-level doc comment.
 */
export function e2eMapPin(overrides: Record<string, unknown> = {}) {
  return {
    id: 'listing-e2e-map-1',
    latitude: 40.18,
    longitude: 44.51,
    title: 'E2E Map Toy',
    pricePerDay: 5,
    priceUnit: 'Daily',
    currency: 'AMD',
    primaryImageUrl: null,
    rating: null,
    reviewCount: 0,
    ...overrides,
  };
}

/**
 * `count` `ListingImage`-shaped entries for gallery mosaic/lightbox tests.
 * URLs are relative and deliberately unresolvable (404 against the dev
 * server) — the gallery only needs a real `<img src>` string, never a real
 * network fetch, and a fast local 404 keeps the suite from depending on any
 * external host.
 */
export function e2eListingImages(
  count: number,
): { id: string; url: string; isPrimary: boolean; sortOrder: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `img-e2e-${i + 1}`,
    url: `/e2e-fixtures/toy-${i + 1}.png`,
    isPrimary: i === 0,
    sortOrder: i,
  }));
}

/** POST /api/bookings success response (`CreateBookingResponse` wire shape). */
export function e2eCreateBookingResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-e2e-1',
    listingId: 'listing-e2e-1',
    status: 'Pending',
    startDate: '2026-09-10',
    endDate: '2026-09-12',
    totalPrice: 15,
    createdAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

/** One `GET /api/bookings/mine` item (`MyBooking` wire shape). */
export function e2eMyBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-e2e-1',
    listingId: 'listing-e2e-1',
    listingTitle: 'E2E Wooden Train Set',
    listingPrimaryImageUrl: null,
    ownerFirstName: 'Olive',
    ownerLastName: 'Owner',
    startDate: '2026-09-10',
    endDate: '2026-09-12',
    totalPrice: 15,
    status: 'Pending',
    createdAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

/** POST /api/chat/conversations/from-booking/:id response (`ChatConversationDetails`). */
export function e2eChatConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chat-e2e-1',
    bookingId: 'booking-e2e-1',
    counterpartId: 'owner-e2e-1',
    counterpartName: 'Olive Owner',
    counterpartAvatarUrl: null,
    counterpartVerified: false,
    toyTitle: 'E2E Wooden Train Set',
    toyImageUrl: null,
    status: 'requested',
    bookingDates: '2026-09-10 – 2026-09-12',
    bookingPrice: 15,
    isClosed: false,
    messages: [],
    ...overrides,
  };
}

/**
 * `GET /api/reviews/listing/:id` (`ToyReviewSummary` wire shape). Defaults to
 * the below-aggregate-threshold shape the backend actually sends for a listing
 * with fewer than `MinReviewsForAggregate` (2) reviews: `hasAggregate: false`
 * with `0.0` averages, but a real (non-empty) `comments` array — this is the
 * exact fabricated-data trap the details-page redesign had to avoid (never
 * render the 0.0 as a real rating).
 */
export function e2eToyReviewSummary(overrides: Record<string, unknown> = {}) {
  return {
    reviewCount: 1,
    hasAggregate: false,
    overallAverage: 0,
    conditionAverage: 0,
    cleanlinessAverage: 0,
    valueForMoneyAverage: 0,
    funPlayValueAverage: 0,
    descriptionAccuracyAverage: 0,
    distribution: [0, 0, 0, 0, 0],
    comments: [
      {
        id: 'review-e2e-1',
        reviewerFirstName: 'Renata',
        reviewerLastName: 'Renter',
        reviewerAvatarUrl: null,
        comment: 'Kids loved it, arrived clean.',
        rentedDays: 3,
        createdAt: '2026-07-20T10:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

export function e2ePendingListing(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pending-e2e-1',
    title: 'E2E Toy Kitchen',
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
