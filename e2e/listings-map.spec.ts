import { expect, test } from '@playwright/test';

import { mockApi } from './support/api-mock';
import { mockTiles } from './support/tile-mock';
import { e2eListing, e2eListingDetails, e2eMapPin } from './support/fixtures';

/**
 * Maps P2-2: the catalogue map view (`/listings?view=map`) — real Leaflet
 * (dynamically imported, not mocked), tiles + `GET /api/listings/map-pins`
 * stubbed at the network layer via `support/tile-mock.ts`/`support/api-mock.ts`,
 * same convention `listing-location.spec.ts` and
 * `location-picker-hint-overlap.spec.ts` already establish for this repo's
 * map journeys: journeys assert on `tiles.count()` and app-owned BEM classes,
 * never on rendered pixels.
 *
 * Unit coverage already in place (`listings-map.component.spec.ts`, 551
 * tests/58 files overall) mounts the REAL `app-map` with only `leaflet`
 * itself mocked, and already pins down: the pin-grouping/badge logic, the
 * 400ms viewport debounce, the fitPins loop-avoidance discipline, the 150ms
 * popup close-grace timer (via fake timers + synthetic DOM events on a
 * detached marker element), and the `isTruncated` banner render. This file
 * does NOT re-prove any of that in a browser — it proves the one thing jsdom
 * + a mocked Leaflet cannot: that the REAL Leaflet library, given this app's
 * real markup/CSS, actually renders one ball per group, actually fires real
 * `mouseover`/`mouseout` on marker DOM Leaflet itself created, and that a
 * real popup positioned beside a real ball is actually reachable with a real
 * mouse.
 *
 * Deliberately NOT covered here (unit tier already owns these, and a browser
 * journey would only re-assert the same conditional-template logic already
 * proven in `listings-map.component.spec.ts` without exercising anything
 * Leaflet/browser-specific):
 * - the `isTruncated` banner's appearance — plain conditional rendering of a
 *   flag the backend computes (xUnit-covered) and the component renders
 *   (unit-covered `shows the truncated-results banner…` test); no Leaflet or
 *   real-DOM behaviour is involved in showing/hiding a `<div>`.
 * - the viewport-driven debounced refetch — proven at the unit tier against
 *   the REAL component with fake timers, which can assert the exact 400ms
 *   boundary deterministically; simulating a real Leaflet pan/zoom gesture in
 *   Playwright to reach the same `moveend` this component reacts to would be
 *   both slower and less precise about the timing than the fake-timer test
 *   already is, for the same property.
 * Per-group uncertainty circles (`markerRadiusMeters`) are real Leaflet
 * `L.circle` layers with no app-owned CSS class (unlike the ball, which gets
 * `.app-map__pin` via this component's own `divIcon` className) — asserting
 * their presence would mean coupling this spec to Leaflet's internal SVG
 * `<path>` DOM shape rather than anything this app declares, which is exactly
 * what this repo's map-testing convention (assert `tiles.count()`, never
 * rendered internals) says not to do. Left as a gap — see the qa-engineer
 * report for the precise, low-cost fix (a stable `className` on the circle
 * layer) if this ever needs its own regression net.
 */
test.describe('Listings — map view (Maps P2-2)', () => {
  test('toggling List/Map renders the map and fetches tiles, hides the grid, and survives a reload', async ({
    page,
  }) => {
    const tiles = await mockTiles(page);
    await mockApi(page, {
      listings: [e2eListing()],
      mapPins: [e2eMapPin()],
    });

    await page.goto('/listings');

    const grid = page.locator('.listings-page__grid');
    const map = page.locator('.listings-map');
    await expect(grid).toBeVisible();
    await expect(map).toHaveCount(0);

    await page.locator('.lp-view-toggle .lp-view-toggle__btn', { hasText: 'Map' }).click();

    await expect(map).toBeVisible();
    await expect(grid).toHaveCount(0);
    await expect.poll(() => tiles.count()).toBeGreaterThan(0);
    await expect(page).toHaveURL(/[?&]view=map(&|$)/);

    // `?view=map` is the URL's own source of truth (see
    // `ListingsPageComponent.viewMode`'s doc comment) — a reload must land
    // back in map mode with no toggle click needed.
    await page.reload();
    await expect(page.locator('.listings-map')).toBeVisible();
    await expect(page.locator('.listings-page__grid')).toHaveCount(0);

    await page.locator('.lp-view-toggle .lp-view-toggle__btn', { hasText: 'List' }).click();
    await expect(page.locator('.listings-page__grid')).toBeVisible();
    await expect(page.locator('.listings-map')).toHaveCount(0);
  });

  test('collapses toys sharing a published coordinate into one ball with a stacked popup, and keeps a different coordinate separate', async ({
    page,
  }) => {
    // Two toys published at the EXACT same coordinate (ADR-008: the same
    // geohash-7 cell centroid two nearby real addresses can share) must
    // render as one ball; a third at a materially different coordinate must
    // stay its own, separate ball — the collapse key is exact-value equality
    // (see `listing-pin-group.util.ts`), not proximity.
    await mockTiles(page);
    await mockApi(page, {
      mapPins: [
        e2eMapPin({ id: 'pin-collapse-a', latitude: 40.18, longitude: 44.51, title: 'Toy A1' }),
        e2eMapPin({ id: 'pin-collapse-b', latitude: 40.18, longitude: 44.51, title: 'Toy A2' }),
        e2eMapPin({ id: 'pin-distinct-c', latitude: 40.19, longitude: 44.525, title: 'Toy B' }),
      ],
    });

    await page.goto('/listings?view=map');

    const balls = page.locator('.listings-map .app-map__pin');
    // Two distinct published coordinates -> two balls, not three.
    await expect(balls).toHaveCount(2);

    const collapsedBall = balls.filter({ has: page.locator('.app-map__pin-badge') });
    await expect(collapsedBall).toHaveCount(1);
    await expect(collapsedBall.locator('.app-map__pin-badge')).toHaveText('2');

    await collapsedBall.hover();
    const stack = page.locator('.listings-map__popup-stack');
    await expect(stack).toBeVisible();
    await expect(stack.locator('app-listings-map-popup')).toHaveCount(2);
    await expect(stack).toContainText('Toy A1');
    await expect(stack).toContainText('Toy A2');

    // The other (single-pin) group must show exactly one card, no stack wrapper.
    const singleBall = balls.filter({ hasNot: page.locator('.app-map__pin-badge') });
    await singleBall.hover();
    await expect(page.locator('.listings-map__popup-stack')).toHaveCount(0);
    await expect(page.locator('.listings-map-popup__title')).toHaveText('Toy B');
  });

  test('hovering a ball opens its popup with the toy details, and the popup links to /listings/:id', async ({
    page,
  }) => {
    await mockTiles(page);
    await mockApi(page, {
      mapPins: [
        e2eMapPin({
          id: 'listing-e2e-map-details',
          title: 'Wooden Train Set',
          pricePerDay: 7,
          rating: 4.5,
          reviewCount: 10,
        }),
      ],
      listingDetails: e2eListingDetails({ id: 'listing-e2e-map-details', title: 'Wooden Train Set' }),
    });

    await page.goto('/listings?view=map');

    await page.locator('.app-map__pin').hover();
    const popup = page.locator('.listings-map-popup');
    await expect(popup).toBeVisible();
    await expect(popup.locator('.listings-map-popup__title')).toHaveText('Wooden Train Set');
    await expect(popup.locator('.listings-map-popup__rating-value')).toHaveText('4.5');
    await expect(popup.locator('.listings-map-popup__price-amount')).toBeVisible();

    await popup.locator('.listings-map-popup__view-btn').click();
    await expect(page).toHaveURL(/\/listings\/listing-e2e-map-details(\?|$)/);
  });

  test('the popup stays open when the pointer moves from the ball onto it, past the close grace period', async ({
    page,
  }) => {
    await mockTiles(page);
    await mockApi(page, {
      mapPins: [e2eMapPin({ id: 'listing-e2e-map-grace', title: 'Grace Period Toy' })],
    });

    await page.goto('/listings?view=map');

    await page.locator('.app-map__pin').hover();
    const anchor = page.locator('.listings-map__popup-anchor');
    await expect(anchor).toBeVisible();

    // Move the real pointer off the ball and onto the popup itself — this is
    // the exact path `ListingsMapComponent.POPUP_CLOSE_GRACE_MS` (150ms)
    // exists to protect: the popup must still be reachable, not vanish the
    // instant the pointer leaves the ball.
    const box = await anchor.boundingBox();
    if (!box) throw new Error('popup anchor has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(anchor).toBeVisible();

    // Wait past the 150ms grace window (deliberately, not an arbitrary
    // stabilization delay): a real close-timer would have fired by now if
    // resting on the popup hadn't cancelled it (`onPopupMouseEnter` ->
    // `cancelCloseTimer`) — this is the regression the task calls out as
    // "silently regresses" if the grace wiring ever breaks.
    await page.waitForTimeout(300);
    await expect(anchor).toBeVisible();
    await expect(anchor).toContainText('Grace Period Toy');
  });

  test('applying a filter re-requests map pins with the filter still attached', async ({ page }) => {
    await mockTiles(page);
    await mockApi(page, {
      mapPins: [e2eMapPin()],
      categories: [{ id: 'cat-e2e-map-filter', name: 'Toys', slug: 'toys' }],
    });

    const mapPinsRequests: URL[] = [];
    // Observes (never fulfills) — the actual response still comes from
    // `mockApi`'s own `**/api/**` handler, registered above. Playwright
    // invokes route handlers most-recently-registered-first, so this spy
    // (registered after `mockApi`) sees the request first and hands it back
    // via `route.fallback()` for `mockApi`'s handler to actually answer —
    // this file never stubs the response itself, per the existing
    // `api-mock.ts` convention.
    await page.route('**/api/listings/map-pins**', async (route) => {
      mapPinsRequests.push(new URL(route.request().url()));
      await route.fallback();
    });

    await page.goto('/listings?view=map');
    await expect.poll(() => mapPinsRequests.length).toBeGreaterThan(0);
    expect(mapPinsRequests.at(-1)!.searchParams.get('categoryId')).toBeNull();

    await page
      .locator('.lp-sidebar__checkbox-row', { hasText: 'Toys' })
      .locator('.lp-sidebar__checkbox')
      .click();

    await expect(page).toHaveURL(/[?&]categoryId=cat-e2e-map-filter(&|$)/);
    await expect
      .poll(() => mapPinsRequests.at(-1)?.searchParams.get('categoryId'))
      .toBe('cat-e2e-map-filter');
    // The map surface itself must not have been abandoned by the filter change.
    await expect(page).toHaveURL(/[?&]view=map(&|$)/);
  });

  test('the toolbar does not overflow a 375px viewport, in list or map mode (regression)', async ({
    page,
  }) => {
    // Regression for a bug this feature introduced: adding the List/Map
    // toggle to `.lp-toolbar` (flex, nowrap) pushed the sort control off
    // -screen at 375px — `document.documentElement.scrollWidth` measured 460
    // against a 375 `window.innerWidth` (confirmed via git-stash A/B: the
    // pre-feature baseline measured 375/375). Fixed in
    // `listings-page.component.scss` by letting `.lp-toolbar__count` shrink/
    // ellipsize and the view-toggle go icon-only below 560px. This property
    // is invisible to jsdom unit tests — it needs a real browser laying out
    // a real viewport — so this is the one place it can be caught
    // automatically. Deliberately narrow: one viewport, one property
    // (scrollWidth <= innerWidth), both view modes the bug affected.
    await page.setViewportSize({ width: 375, height: 800 });
    await mockTiles(page);
    await mockApi(page, { listings: [e2eListing()], mapPins: [e2eMapPin()] });

    const overflowPx = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

    await page.goto('/listings');
    await expect(page.locator('.listings-page__grid')).toBeVisible();
    await expect.poll(overflowPx).toBeLessThanOrEqual(0);
    await expect(page.locator('.lp-toolbar__sort')).toBeInViewport();

    await page.locator('.lp-view-toggle .lp-view-toggle__btn', { hasText: 'Map' }).click();
    await expect(page.locator('.listings-map')).toBeVisible();
    await expect.poll(overflowPx).toBeLessThanOrEqual(0);
    await expect(page.locator('.lp-toolbar__sort')).toBeInViewport();
  });
});
