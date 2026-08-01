import { expect, test } from '@playwright/test';

import { ACCOUNTS, API_URL, TOY_KITCHEN, apiLogin, assertDockerStack } from '../support/real-stack';

/**
 * Regression coverage for the ADR-008 privacy gate as it applies to
 * `GET /api/listings/map-pins` (Maps P2-1): a map pin must always carry the
 * public, geohash-6-fuzzed coordinate (`Listing.PublicLatitude/Longitude`),
 * never the exact pin the owner dropped (`Listing.Latitude/Longitude`) — and,
 * unlike `GET /api/listings/{id}`, there is NO privileged variant: an
 * authenticated owner or admin gets the identical fuzzed pair an anonymous
 * caller gets. `ListingsController.GetMapPins` never reads `ClaimsPrincipal`
 * at all (contrast `GetListingById`, which resolves `callerId`/`isAdmin` and
 * feeds them to the service).
 *
 * Why real-stack, not (only) the existing xUnit unit test
 * (`ListingMapPinsQueryServiceTests.Pin_Exposes_Public_Coordinate_Not_Exact_
 * Coordinate`): that test calls `ListingsQueryService.GetMapPinsAsync`
 * directly with a hand-seeded SQLite row — it proves the *service method*
 * has no exact-coordinate code path, but it never goes through
 * `ListingsController`, real JWT auth middleware, or real SQL Server. A
 * regression that added an admin/owner bypass *in the controller* (e.g.
 * `if (isAdmin) filter.IncludeExact = true`, mirroring what
 * `GetListingById` legitimately does) would not touch the service method
 * the unit test exercises at all, so that test would stay green while the
 * live endpoint started leaking exact coordinates to authenticated owners.
 * This is exactly the M-017 class the task calls out: a privacy gate whose
 * unit test proves the sub-component is safe is not the same claim as "the
 * live, deployed route is safe" — only a call through the real controller +
 * real auth pipeline proves the latter.
 *
 * Why API-level (Playwright `request`), not a browser map journey — still
 * true now that P2-2 (the frontend map view, `Rental-Ui/e2e/listings-map.
 * spec.ts`) has shipped: the property under test — "the wire response is
 * identical regardless of caller identity" — is a server contract property
 * with no rendering involved. A caller identity never varies within a single
 * browser session (there is no in-page "log in as owner vs. admin vs.
 * anonymous, refetch the same pin, diff the bytes" journey a real visitor
 * ever performs), so proving it through `app-map`/Leaflet would add browser
 * rendering cost without exercising anything the UI layer actually does
 * differently per caller — the frontend map view never sees more than ONE
 * identity's response per session at all. A direct API call proves the real
 * property without paying for that cost or coupling an identity-comparison
 * test to UI rendering it has no dependency on.
 *
 * Determinism: relies only on dev-seed invariants (TOY_KITCHEN, its literal
 * exact coordinate, and the `owner@rental.local`/`admin@rental.local` demo
 * accounts) plus `ListingLocationBackfillExtensions` running unconditionally
 * on every API startup (see real-stack.ts). No booking or mutation state
 * involved — safe to re-run indefinitely, and independent of run order.
 */

interface MapPin {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
}

interface MapPinsResponse {
  readonly items: MapPin[];
  readonly isTruncated: boolean;
}

async function getToyKitchenPin(
  request: import('@playwright/test').APIRequestContext,
  headers?: Record<string, string>,
): Promise<MapPin> {
  const res = await request.get(`${API_URL}/api/listings/map-pins`, { headers });
  expect(res.ok(), 'GET /api/listings/map-pins must succeed').toBe(true);
  const body = (await res.json()) as MapPinsResponse;
  const pin = body.items.find((p) => p.id === TOY_KITCHEN.id);
  expect(pin, 'TOY_KITCHEN seed invariant missing from map-pins response').toBeTruthy();
  return pin!;
}

// A single spec, deliberately: the API login endpoint carries a strict
// per-IP rate limit (RateLimiterExtensions.AuthPolicy: 5 requests/minute,
// fixed window) shared across every real-stack spec file, since they all
// call through the same docker-mapped host. One owner login + one admin
// login here (2 of the 5) leaves headroom for booking-lifecycle.spec.ts,
// which needs several of its own in the same window — splitting this into
// multiple tests, each logging in again "for isolation", trips 429s when
// the full `real` project runs in parallel (observed while stabilizing this
// spec: booking-lifecycle failed with 429 once this file's login calls were
// doubled across two tests).
test.describe('Map pins coordinate privacy (real stack)', () => {
  test('map pin is always the public pair; listing detail grants the exact one only to the owner', async ({
    request,
  }) => {
    await test.step('guard: docker stack is what is actually serving :4200/:8080', async () => {
      await assertDockerStack(request);
    });

    const anonPin = await test.step('fetch TOY_KITCHEN pin anonymously', () =>
      getToyKitchenPin(request));

    // The core ADR-008 property: the pin is not the exact owner-dropped coordinate.
    expect(
      anonPin.latitude,
      'map pin must not leak the exact owner-dropped latitude',
    ).not.toBeCloseTo(TOY_KITCHEN.exactLatitude, 3);
    expect(
      anonPin.longitude,
      'map pin must not leak the exact owner-dropped longitude',
    ).not.toBeCloseTo(TOY_KITCHEN.exactLongitude, 3);

    const ownerToken = await apiLogin(request, ACCOUNTS.owner);
    const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };

    const ownerPin = await test.step("fetch TOY_KITCHEN pin as the listing's own owner", () =>
      getToyKitchenPin(request, ownerHeaders));

    const adminToken = await apiLogin(request, ACCOUNTS.admin);
    const adminPin = await test.step('fetch TOY_KITCHEN pin as admin', () =>
      getToyKitchenPin(request, { Authorization: `Bearer ${adminToken}` }));

    // The property that has no unit-test equivalent: an authenticated owner/admin
    // caller must get the SAME fuzzed pair as an anonymous caller — map-pins has
    // no privileged variant, unlike GET /api/listings/{id}.
    expect(
      ownerPin,
      'owner-authenticated map pin must be byte-identical to the anonymous one — ' +
        'map-pins must never grant a privileged (exact) coordinate to anyone',
    ).toEqual(anonPin);
    expect(
      adminPin,
      'admin-authenticated map pin must be byte-identical to the anonymous one — ' +
        'map-pins must never grant a privileged (exact) coordinate to anyone',
    ).toEqual(anonPin);

    // Contrast fixture, same owner token (no extra login): documents the
    // asymmetry this suite exists to police — unlike map-pins, the
    // listing-details endpoint DOES have a legitimate privileged variant. If
    // this assertion ever fails on its own (map-pins assertions above still
    // green), TOY_KITCHEN's seed coordinate changed and the constants in
    // real-stack.ts need updating alongside it — not itself a privacy
    // regression to chase.
    const detailRes = await test.step('fetch TOY_KITCHEN detail as owner (exact coordinate expected)', () =>
      request.get(`${API_URL}/api/listings/${TOY_KITCHEN.id}`, { headers: ownerHeaders }));
    expect(detailRes.ok()).toBe(true);
    const detail = (await detailRes.json()) as { latitude: number; longitude: number };

    expect(detail.latitude).toBeCloseTo(TOY_KITCHEN.exactLatitude, 3);
    expect(detail.longitude).toBeCloseTo(TOY_KITCHEN.exactLongitude, 3);
  });
});
