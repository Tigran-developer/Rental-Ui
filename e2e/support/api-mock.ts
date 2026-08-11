import type { Page, Route } from '@playwright/test';

import { e2eDistricts } from './fixtures';

/**
 * Network-level backend stub for E2E journeys. Install once per test with the
 * state the journey needs; every `/api/**` request is answered from this seed so
 * the journeys assert app behaviour, not server wiring.
 *
 * Unmatched GETs resolve to an empty success and unmatched writes to 200 {} so a
 * journey only has to declare the slice of state it cares about.
 */
export interface ApiSeed {
  /** GET /api/auth/me — null/omitted responds 401 (anonymous). */
  me?: unknown;
  /** GET /api/listings — items for the paged listings response. */
  listings?: unknown[];
  /**
   * GET /api/listings — `totalCount` on the same envelope, independent of
   * `listings.length` (the count-only `pageSize: 1` request the Home hero
   * map's granted-geolocation branch makes — `home.effects.ts`'s
   * `loadNearbyPinsForOrigin$` — reads ONLY this field, never the returned
   * `items` array). Defaults to `listings?.length ?? 0` so every existing
   * caller that never set this keeps seeing the previous (items-length)
   * behaviour unchanged.
   */
  listingsTotalCount?: number;
  /** GET /api/listings/:id — a single listing's full detail payload. */
  listingDetails?: unknown;
  /** GET /api/admin/listings/pending */
  pendingListings?: unknown[];
  /** GET /api/categories — defaults to a single "Toys" category. */
  categories?: unknown[];
  /**
   * GET /api/districts — defaults to the real 12 Yerevan districts (see
   * `e2eDistricts()`) so this can't silently drift from what the backend seeds.
   */
  districts?: unknown[];
  /** POST /api/auth/login outcome. */
  login?: { token?: string; status?: number; body?: unknown };
  /** POST /api/listings outcome — defaults to a successful creation. */
  createListing?: { status?: number; body?: unknown };
  /** GET /api/listings/map-pins — items for the catalogue map view (Maps P2-2). */
  mapPins?: unknown[];
  /** GET /api/listings/map-pins — `isTruncated` flag on the same envelope. */
  mapPinsTruncated?: boolean;
  /** POST /api/bookings outcome — defaults to a successful Pending booking. */
  createBooking?: { status?: number; body?: unknown };
  /** GET /api/bookings/mine — items for "my bookings" (booking-relationship UI). */
  myBookings?: unknown[];
  /** GET /api/reviews/listing/:id — the toy-review aggregate + comments for a listing. */
  listingToyReviews?: unknown;
  /** POST /api/chat/conversations/from-booking/:bookingId outcome — "Message {owner}" CTA. */
  chatFromBooking?: { status?: number; body?: unknown };
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function mockApi(page: Page, seed: ApiSeed = {}): Promise<void> {
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    if (pathname.endsWith('/api/auth/login')) {
      const status = seed.login?.status ?? 200;
      return json(
        route,
        status,
        seed.login?.body ?? { token: seed.login?.token ?? 'e2e-jwt-token' },
      );
    }

    if (pathname.endsWith('/api/auth/me')) {
      return seed.me ? json(route, 200, seed.me) : json(route, 401, { detail: 'Unauthenticated' });
    }

    if (pathname.endsWith('/api/admin/listings/pending')) {
      return json(route, 200, seed.pendingListings ?? []);
    }

    if (pathname.endsWith('/api/listings') && method === 'GET') {
      return json(route, 200, {
        items: seed.listings ?? [],
        totalCount: seed.listingsTotalCount ?? (seed.listings ?? []).length,
        page: 1,
        pageSize: 20,
        hasMore: false,
      });
    }

    if (pathname.endsWith('/api/listings') && method === 'POST') {
      const status = seed.createListing?.status ?? 200;
      return json(
        route,
        status,
        seed.createListing?.body ?? { id: 'listing-created-e2e-1', status: 'PendingApproval' },
      );
    }

    // GET /api/listings/map-pins — Maps P2-2 catalogue map view. Must be
    // checked BEFORE the singleListingId regex below, which would otherwise
    // match "map-pins" as if it were a listing id (same reason "mine" is
    // excluded there).
    if (pathname.endsWith('/api/listings/map-pins') && method === 'GET') {
      return json(route, 200, {
        items: seed.mapPins ?? [],
        isTruncated: seed.mapPinsTruncated ?? false,
      });
    }

    // GET /api/listings/{id} — a single listing's detail payload. Excludes
    // /api/listings/mine and /api/listings/map-pins, which have their own
    // (list-shaped) responses elsewhere.
    const singleListingId = pathname.match(/^\/api\/listings\/([^/]+)$/)?.[1];
    if (singleListingId && singleListingId !== 'mine' && singleListingId !== 'map-pins' && method === 'GET') {
      return json(route, 200, seed.listingDetails ?? {});
    }

    // POST /api/bookings — create a booking request. Checked with an exact
    // suffix match (not a prefix regex) so it never shadows
    // /api/bookings/mine or /api/bookings/requests below.
    if (pathname.endsWith('/api/bookings') && method === 'POST') {
      const status = seed.createBooking?.status ?? 200;
      return json(
        route,
        status,
        seed.createBooking?.body ?? {
          id: 'booking-e2e-1',
          listingId: 'listing-e2e-1',
          status: 'Pending',
          startDate: '2026-09-10',
          endDate: '2026-09-12',
          totalPrice: 15,
          createdAt: '2026-08-01T10:00:00.000Z',
        },
      );
    }

    if (pathname.endsWith('/api/bookings/mine') && method === 'GET') {
      return json(route, 200, seed.myBookings ?? []);
    }

    // GET /api/reviews/listing/{id} — toy-review aggregate + comments for the
    // listing detail page's reviews section.
    if (/^\/api\/reviews\/listing\/[^/]+$/.test(pathname) && method === 'GET') {
      return json(route, 200, seed.listingToyReviews ?? {
        reviewCount: 0,
        hasAggregate: false,
        overallAverage: 0,
        conditionAverage: 0,
        cleanlinessAverage: 0,
        valueForMoneyAverage: 0,
        funPlayValueAverage: 0,
        descriptionAccuracyAverage: 0,
        distribution: [0, 0, 0, 0, 0],
        comments: [],
      });
    }

    // POST /api/chat/conversations/from-booking/{bookingId} — "Message {owner}"
    // CTA on the booking confirmation screen.
    if (/^\/api\/chat\/conversations\/from-booking\/[^/]+$/.test(pathname) && method === 'POST') {
      const status = seed.chatFromBooking?.status ?? 200;
      return json(
        route,
        status,
        seed.chatFromBooking?.body ?? {
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
        },
      );
    }

    if (pathname.endsWith('/api/categories') && method === 'GET') {
      return json(route, 200, seed.categories ?? [{ id: 'cat-e2e-1', name: 'Toys', slug: 'toys' }]);
    }

    if (pathname.endsWith('/api/districts') && method === 'GET') {
      return json(route, 200, seed.districts ?? e2eDistricts());
    }

    // Anything else: keep the app happy with a benign success.
    if (method === 'GET') return json(route, 200, []);
    return json(route, 200, {});
  });
}
