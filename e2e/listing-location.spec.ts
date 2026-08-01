import { expect, test } from '@playwright/test';

import { mockApi } from './support/api-mock';
import { mockTiles } from './support/tile-mock';
import { e2eListingDetails } from './support/fixtures';

/**
 * Critical journey (P1-8): the listing-detail location block always shows the
 * district + city as text, and — when the listing has coordinates — the map
 * renders immediately on page load.
 *
 * **Reversed 2026-07-24 (human decision, Tigran):** this journey used to
 * assert the OPPOSITE — that page load fetched zero tiles until the visitor
 * tapped "Show map" — because tiles came from volunteer-funded
 * `tile.openstreetmap.org`, whose usage policy excludes heavy traffic. That
 * tile source is gone: ADR-007's 2026-07-22 amendment moved tiles to MapTiler
 * with a real API key (its own quota, but comfortable headroom at measured
 * production traffic — a tradeoff made knowingly). With the reason for
 * gating removed, the gate itself was removed too, and this journey now
 * asserts that a listing with coordinates fetches tiles on load, same as any
 * other page content — not that it withholds them.
 *
 * Deliberately NOT covered here: which lat/lng a given caller actually
 * receives (the owner's exact pin vs. a non-owner's geohash-fuzzed centroid).
 * That privacy gate lives entirely in the backend and is already covered by
 * xUnit tests (`ListingDetailCoordinatePrivacyTests`,
 * `ListingDetailAddressRevealTests`). With the backend stubbed at the network
 * layer here, an assertion about it would only prove this fixture echoes back
 * whatever the test itself wrote — it wouldn't protect anything real.
 */
test.describe('Listing detail — approximate location', () => {
  test('shows district + city text and renders the map on load, with no tap needed', async ({ page }) => {
    const tiles = await mockTiles(page);
    await mockApi(page, { listingDetails: e2eListingDetails() });

    await page.goto('/listings/listing-e2e-1');

    const place = page.locator('.listing-location__place');
    await expect(place).toContainText('Kentron');
    await expect(place).toContainText('Yerevan');

    // The map card (with its "approximate area" chip) is visible without any
    // click, and the real Leaflet tile layer fetches at least one (stubbed)
    // tile as part of ordinary page load.
    await expect(page.locator('.listing-location__map-card')).toBeVisible();
    await expect(page.locator('.listing-location__chip')).toBeVisible();
    await expect.poll(() => tiles.count()).toBeGreaterThan(0);
  });

  test('falls back to text only when the listing has no coordinates', async ({ page }) => {
    const tiles = await mockTiles(page);
    await mockApi(page, {
      listingDetails: e2eListingDetails({ latitude: null, longitude: null }),
    });

    await page.goto('/listings/listing-e2e-1');

    const place = page.locator('.listing-location__place');
    await expect(place).toContainText('Kentron');
    await expect(place).toContainText('Yerevan');

    // The pin is optional (P1-8 spec) — no coordinates means no map
    // affordance at all, and no tile request.
    await expect(page.locator('.listing-location__map-card')).toHaveCount(0);
    expect(tiles.count()).toBe(0);
  });
});

/**
 * Regression coverage for the dorent.am "My location" bug (confirmed live,
 * 2026-08-01): `GeolocationService` used to request `enableHighAccuracy:
 * false` with a 60s cache, so the blue dot could be off by hundreds of
 * metres to kilometres while the UI printed "≈X from you" with full
 * confidence — no indication the fix was a rough WiFi/IP-level guess.
 *
 * The fix (`enableHighAccuracy: true`, `maximumAge: 0`, plus a threshold
 * that flags any fix over `LOW_ACCURACY_THRESHOLD_METERS`) has two risk
 * layers, deliberately split across two test tiers rather than duplicated:
 * - the exact request-options argument is verified by
 *   `geolocation.service.spec.ts` (a `navigator.geolocation.getCurrentPosition`
 *   spy) — that is the ONLY layer that can see it. Playwright's
 *   `context.setGeolocation()` is a CDP-level override that answers with
 *   whatever coordinate/accuracy it's given regardless of the
 *   `enableHighAccuracy`/`maximumAge` the caller actually requested, so no
 *   browser-level test can observe that argument.
 * - what a browser-level test CAN observe, and what nothing currently does,
 *   is the consumption side: does a real `navigator.geolocation` round trip
 *   through the real component tree (`ListingLocationComponent` →
 *   `ListingsMapComponent` → `MapComponent`) actually disclose a low-accuracy
 *   fix instead of rendering it as confident, and does it stay quiet for a
 *   high-accuracy one. That's what these two tests pin down.
 *
 * Selectors: `.listing-location__geo-denied` is the SAME block used for both
 * the `denied` state and the `lowAccuracy` state within the `granted` case
 * (see `listing-location.component.html`'s `@switch (geoState())` —
 * `lowAccuracy` is checked inside `@case ('granted')`, not a separate
 * `@case`) — confirmed by reading the template, not assumed.
 */
test.describe('Listing detail — "My location" accuracy disclosure', () => {
  test('flags a low-accuracy fix instead of showing it as silently confident', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 40.1, longitude: 44.5, accuracy: 3000 }); // WiFi/IP-level
    await mockTiles(page);
    await mockApi(page, { listingDetails: e2eListingDetails() });

    await page.goto('/listings/listing-e2e-1');
    await page.locator('.listing-location__locate-btn').click();

    // Distance is still shown — a rough distance is better than none — but
    // the soft block offering the manual picker must appear alongside it.
    await expect(page.locator('.listing-location__distance')).toBeVisible();
    await expect(page.locator('.listing-location__geo-denied')).toBeVisible();
  });

  test('shows a plain confident distance line for a high-accuracy fix, no warning', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation']);
    // Matches e2eListingDetails()'s own fixture coordinate (support/fixtures.ts).
    await context.setGeolocation({ latitude: 40.1872, longitude: 44.5152, accuracy: 20 }); // GPS-level
    await mockTiles(page);
    await mockApi(page, { listingDetails: e2eListingDetails() });

    await page.goto('/listings/listing-e2e-1');
    await page.locator('.listing-location__locate-btn').click();

    await expect(page.locator('.listing-location__distance')).toBeVisible();
    await expect(page.locator('.listing-location__geo-denied')).toHaveCount(0);
  });
});
