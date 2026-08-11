import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

import { mockApi } from './support/api-mock';
import { mockTiles } from './support/tile-mock';
import { e2eMapPin } from './support/fixtures';

/**
 * Home hero map (Home-page hero, Part 1) — the app's most-visited page
 * renders a live `app-map` preview. This is a real-Leaflet, network-stubbed
 * journey (same convention as `listing-location.spec.ts` /
 * `listings-map.spec.ts`): tiles come from `mockTiles()`, the backend from
 * `mockApi()`, geolocation is driven through Playwright's CDP-level
 * `context.grantPermissions()`/`setGeolocation()`/`clearPermissions()` — never
 * a fake `navigator.geolocation`.
 *
 * **Geolocation is opt-in, not automatic.** An earlier version called
 * `GeolocationService.getCurrentPosition()` the instant Home loaded, for
 * every visitor — `/code-review` and `/security-review` both flagged it (a
 * browser "Block" choice is stored per-origin, so the first Home visit could
 * permanently disable the `/listings` radius filter's own "use my location"
 * too; and precise coordinates were reaching backend access logs on nearly
 * every page view). Geolocation now only ever runs in response to a click on
 * the hero map's own opt-in button (`HomeNearbyActions.requestMyArea` — see
 * that action group's doc comment in `home.actions.ts`). `init` (page load)
 * maps straight to `useFallbackOrigin`: Yerevan-centred, no user dot, no
 * circle, pill text via the `cityCount` i18n key. Only a resolved opt-in
 * request renders the granted view: user dot, radius (+ accuracy) circle,
 * pill text via `nearbyCount`.
 *
 * Deliberately thin — a handful of behaviours only, each one a documented,
 * specific failure mode (`hero-map.component.ts`/`home.actions.ts`'s own doc
 * comments, and M-027 in `knowledge/mistakes.md`), not general coverage of
 * the map or of the Home page. Zoom-level derivation, the pill's exact copy,
 * and the panel's spacing/tokens are already unit-tested
 * (`hero-map.component.spec.ts`) or are visual-review territory — out of
 * scope here per `Rental-Ui/CLAUDE.md`'s "keep this layer thin" rule.
 *
 * A circle (`circleRadiusMeters`/`userAccuracyMeters`) is a real Leaflet
 * `L.circle` with no app-owned CSS class — `listings-map.spec.ts`'s own doc
 * comment records this repo's convention of NOT coupling a spec to that
 * internal SVG shape, and leaves per-marker uncertainty circles there
 * untested for exactly that reason. This file is a deliberate, narrow
 * exception: circle presence/absence IS the behaviour under test here (not
 * an incidental detail), there is no app-owned alternative signal for it, and
 * it is exactly the M-027-adjacent risk the human asked to be locked down.
 * The selector used (`.leaflet-overlay-pane path`) rests on two DOCUMENTED
 * Leaflet public contracts, not undocumented internals: `overlayPane` is
 * Leaflet's own named pane for vector layers (leafletjs.com), and `L.circle`
 * is always realized as an SVG `<path>` in that pane by the (default) SVG
 * renderer. `HomeHeroMapComponent` never sets `markerRadiusMeters`, so these
 * two circles (`circleRadiusMeters` + `userAccuracyMeters`) are the ONLY
 * vector layers this map can ever draw — a bare count is therefore an
 * unambiguous, deterministic proxy for "is the circle showing", with no
 * colour/shape matching needed.
 */

function circleCount(page: Page): Promise<number> {
  return page.locator('.hero-map .leaflet-overlay-pane path').count();
}

function optInButton(page: Page) {
  return page.locator('.hero-map .app-map__btn');
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  const aRight = a.x + a.width;
  const aBottom = a.y + a.height;
  const bRight = b.x + b.width;
  const bBottom = b.y + b.height;
  return !(aRight <= b.x || a.x >= bRight || aBottom <= b.y || a.y >= bBottom);
}

async function boundingBoxOrThrow(page: Page, selector: string): Promise<Rect> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} has no bounding box`);
  return box;
}

/**
 * Wraps the REAL `navigator.geolocation.getCurrentPosition` (installed via
 * `addInitScript`, so it runs before any app code) with a call counter, then
 * delegates to the original implementation unchanged — CDP's
 * `setGeolocation`/permission handling still works exactly as before, this
 * only observes whether the app ever reached for it. Deliberately NOT the
 * same signal as `home.effects.spec.ts`'s existing unit test (a Vitest spy on
 * an INJECTED FAKE `GeolocationService`, which only proves the effect layer
 * never calls the fake it was given): this wraps the real browser API in a
 * real browser, so it would also catch a regression that bypassed
 * `GeolocationService` entirely — a strictly stronger, complementary check,
 * not a duplicate.
 */
async function trackGeolocationCalls(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const geo = navigator.geolocation as
      | (Geolocation & { getCurrentPosition: unknown })
      | undefined;
    (window as unknown as { __geoCallCount: number }).__geoCallCount = 0;
    if (!geo || typeof geo.getCurrentPosition !== 'function') return;
    const original = geo.getCurrentPosition.bind(geo);
    geo.getCurrentPosition = ((...args: Parameters<Geolocation['getCurrentPosition']>) => {
      (window as unknown as { __geoCallCount: number }).__geoCallCount += 1;
      return original(...args);
    }) as Geolocation['getCurrentPosition'];
  });
}

function geolocationCallCount(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __geoCallCount?: number }).__geoCallCount ?? 0,
  );
}

/**
 * "Centred on Yerevan" (below) is asserted at the DATA layer rather than by
 * poking Leaflet's private `map` instance (not exposed on `window` anywhere
 * in this codebase, deliberately — see `map.component.ts`'s class doc
 * comment on why Leaflet types never leak past that component): the fallback
 * branch (`home.reducer.ts`'s `useFallbackOrigin` handler) sets
 * `nearby.origin = YEREVAN_CENTER`, and `home.effects.ts`'s
 * `loadNearbyPinsForYerevan$` fetches map pins for `YEREVAN_FALLBACK_BOUNDS`,
 * a fixed box derived from that exact same constant. The outgoing
 * `/api/listings/map-pins` request's bounds parameters are therefore a
 * precise, real, app-level proof of what the map actually centred on — not
 * an assumption.
 */
const YEREVAN_CENTER = { lat: 40.1776, lng: 44.5126 };

test.describe('Home hero map — load renders the Yerevan fallback, and never prompts for geolocation', () => {
  test('fallback view (no user dot, no circle, Yerevan-centred pins), zero geolocation calls, zero console errors', async ({
    page,
    context,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await trackGeolocationCalls(page);
    const tiles = await mockTiles(page);
    // No grantPermissions() call at all — a fresh Playwright context starts
    // un-granted, but this clears any override explicitly (the documented
    // counterpart to `grantPermissions`) so this test doesn't merely rely on
    // a fresh-context default.
    await context.clearPermissions();
    await mockApi(page, { mapPins: [e2eMapPin()], mapPinsTruncated: false });

    const mapPinsRequests: URL[] = [];
    // Registered AFTER mockApi so it observes the request first and hands it
    // back via `route.fallback()` for mockApi's own handler to answer — same
    // spy convention `listings-map.spec.ts` already uses.
    await page.route('**/api/listings/map-pins**', async (route) => {
      mapPinsRequests.push(new URL(route.request().url()));
      await route.fallback();
    });

    await page.goto('/');

    const heroMap = page.locator('.hero-map');
    await expect(heroMap).toBeVisible();
    await expect(page.locator('.hero-map .app-map__surface')).toBeVisible();
    await expect.poll(() => tiles.count()).toBeGreaterThan(0);

    // No real "your location" to show — nothing was ever asked.
    await expect(page.locator('.hero-map .app-map__user-marker')).toHaveCount(0);
    expect(await circleCount(page)).toBe(0);

    // The opt-in control is the only way this could ever change — still
    // present, meaning nothing has been granted.
    await expect(optInButton(page)).toBeVisible();

    // Centred on Yerevan — see the doc comment above.
    await expect.poll(() => mapPinsRequests.length).toBeGreaterThan(0);
    const params = mapPinsRequests.at(-1)!.searchParams;
    expect(Number(params.get('minLat'))).toBeCloseTo(YEREVAN_CENTER.lat - 0.045, 6);
    expect(Number(params.get('maxLat'))).toBeCloseTo(YEREVAN_CENTER.lat + 0.045, 6);
    expect(Number(params.get('minLng'))).toBeCloseTo(YEREVAN_CENTER.lng - 0.06, 6);
    expect(Number(params.get('maxLng'))).toBeCloseTo(YEREVAN_CENTER.lng + 0.06, 6);

    // The strongest available signal at this tier that merely loading Home
    // never triggers the browser's geolocation permission flow — the REAL
    // `navigator.geolocation.getCurrentPosition`, wrapped in the real
    // browser, was never called.
    expect(await geolocationCallCount(page)).toBe(0);

    // No thrown/logged error anywhere during the whole load.
    expect(consoleErrors).toEqual([]);
  });
});

/**
 * M-027 ("we asked the browser for an imprecise location, then threw away
 * the field that said how imprecise") — the same "guess rendered as a fact"
 * failure mode, reproduced here for the Home hero's own count pill rather
 * than the listing-detail distance line. `home.effects.ts`'s
 * `loadNearbyPinsForYerevan$` (the ONLY branch that can hit a truncated
 * result — the granted branch gets its count from a dedicated `totalCount`
 * fetch, never from `items.length`) must show `items.length` ONLY when the
 * backend confirms the result is complete (`isTruncated === false`), and
 * hide the pill entirely — never show a floor as a fact — when
 * `isTruncated === true`. Both cases exercise the (now default-on-load)
 * fallback branch, so the pill renders through the `cityCount` i18n key
 * ("{{count}} toys in Yerevan"), not `nearbyCount`.
 */
test.describe('Home hero map — count honesty (M-027)', () => {
  test('shows the pin count when the result is NOT truncated', async ({ page, context }) => {
    await mockTiles(page);
    await context.clearPermissions();
    await mockApi(page, {
      mapPins: [e2eMapPin({ id: 'p1' }), e2eMapPin({ id: 'p2', latitude: 40.2, longitude: 44.53 })],
      mapPinsTruncated: false,
    });

    await page.goto('/');

    await expect(page.locator('.hero-map__pill')).toContainText('2 toys in Yerevan');
  });

  test('hides the pill entirely when the result IS truncated — never shows a floor as a fact', async ({
    page,
    context,
  }) => {
    const tiles = await mockTiles(page);
    await context.clearPermissions();
    await mockApi(page, {
      mapPins: [e2eMapPin({ id: 'p1' }), e2eMapPin({ id: 'p2', latitude: 40.2, longitude: 44.53 })],
      mapPinsTruncated: true,
    });

    await page.goto('/');

    await expect(page.locator('.hero-map')).toBeVisible();
    await expect.poll(() => tiles.count()).toBeGreaterThan(0);
    await expect(page.locator('.hero-map__pill')).toHaveCount(0);
  });
});

test.describe('Home hero map — geolocation granted (via the opt-in control)', () => {
  test('after clicking "show my area": renders the user dot, the radius circle, and a resolved "N toys nearby" count', async ({
    page,
    context,
  }) => {
    const tiles = await mockTiles(page);
    await context.grantPermissions(['geolocation']);
    // Accuracy 25m is a genuine GPS-level fix (well under both
    // `ListingLocationComponent`'s low-accuracy threshold and
    // `HomePageComponent`'s own 1400m hero-circle ceiling) — keeps
    // `accuracyMeters` unambiguously positive and below that ceiling, so the
    // user accuracy circle is guaranteed to draw.
    await context.setGeolocation({ latitude: 40.19, longitude: 44.52, accuracy: 25 });
    await mockApi(page, {
      mapPins: [e2eMapPin()],
      mapPinsTruncated: false,
      // Deliberately different from `mapPins.length` (1) — proves the pill
      // reads the dedicated count fetch (`getListings(..., 1, 1, origin)`'s
      // `totalCount`), not the pins array it also received.
      listingsTotalCount: 37,
    });

    await page.goto('/');

    // Geolocation is opt-in — the granted view never appears without this click.
    const button = optInButton(page);
    await expect(button).toBeVisible();
    await button.click();

    const heroMap = page.locator('.hero-map');
    await expect(heroMap).toBeVisible();
    await expect.poll(() => tiles.count()).toBeGreaterThan(0);

    // The blue user-location dot (`app-map`'s `userPin`, driven by the
    // resolved geolocation fix).
    await expect(page.locator('.hero-map .app-map__user-marker')).toBeVisible();

    // The orange search-radius circle AND the blue accuracy circle — see the
    // class doc comment above for why a bare count of 2 is the right proxy.
    await expect.poll(() => circleCount(page)).toBe(2);

    // The "N toys nearby" pill shows the RESOLVED count, not a placeholder.
    await expect(page.locator('.hero-map__pill')).toContainText('37 toys nearby');

    // Nothing left to opt into.
    await expect(button).toHaveCount(0);
  });
});

/**
 * The whole feature in one journey (per the task): load shows the Yerevan
 * fallback, opting in switches every part of the panel to the granted view
 * — not just one input in isolation, but the dot, the circle, AND the pill's
 * wording all changing together off the SAME click.
 */
test.describe('Home hero map — opt-in journey, end to end', () => {
  test('load → Yerevan fallback → click "show my area" → granted view, pill wording switches too', async ({
    page,
    context,
  }) => {
    const tiles = await mockTiles(page);
    // Pre-grant so the click-triggered request resolves immediately instead
    // of hanging on a real permission prompt — the app never asks until the
    // click regardless of this being granted up front (see the "never
    // prompts on load" test above), so this doesn't weaken what's proven
    // here: the transition is still driven entirely by the click.
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 40.19, longitude: 44.52, accuracy: 30 });
    await mockApi(page, {
      mapPins: [e2eMapPin()],
      mapPinsTruncated: false,
      // Distinct from the fallback pin count (1) so the pill's NUMBER, not
      // just its wording, is proven to switch branches.
      listingsTotalCount: 5,
    });

    await page.goto('/');
    await expect.poll(() => tiles.count()).toBeGreaterThan(0);

    // 1. Fallback view.
    await expect(page.locator('.hero-map .app-map__user-marker')).toHaveCount(0);
    expect(await circleCount(page)).toBe(0);
    await expect(page.locator('.hero-map__pill')).toContainText('1 toys in Yerevan');
    const button = optInButton(page);
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-label', 'Show my area');

    // 2. Opt in.
    await button.click();

    // 3. Granted view — dot, circle, AND pill wording all switch off the same click.
    await expect(page.locator('.hero-map .app-map__user-marker')).toBeVisible();
    await expect.poll(() => circleCount(page)).toBe(2);
    await expect(page.locator('.hero-map__pill')).toContainText('5 toys nearby');
    await expect(button).toHaveCount(0);
  });
});

/**
 * Regression for a defect that already shipped once during development (per
 * the task): the pill was originally bottom-left, directly on top of the
 * MapTiler logo, and was moved to top-left in `hero-map.component.scss`. The
 * logo and Leaflet's own attribution control are both licence-mandated and
 * must never be occluded — see `map.component.ts`'s class doc comment. The
 * opt-in button (`.app-map__actions`, bottom-right, "raised clear of
 * Leaflet's attribution control" per that slot's own doc comment in
 * map.component.scss) is a second, newer piece of chrome sharing that same
 * bottom-right corner with the attribution control — checked independently
 * here rather than trusted from that comment.
 */
test.describe('Home hero map — licence chrome stays visible', () => {
  test('the pill and the opt-in button never overlap the MapTiler logo or the attribution control', async ({
    page,
    context,
  }) => {
    const tiles = await mockTiles(page);
    await context.clearPermissions();
    await mockApi(page, { mapPins: [e2eMapPin()], mapPinsTruncated: false });

    await page.goto('/');
    await expect.poll(() => tiles.count()).toBeGreaterThan(0);
    await expect(page.locator('.hero-map__pill')).toBeVisible();
    await expect(optInButton(page)).toBeVisible();
    await expect(page.locator('.hero-map .app-map__maptiler-logo')).toBeVisible();
    await expect(page.locator('.hero-map .leaflet-control-attribution')).toBeVisible();

    const assertNoOverlap = async () => {
      const pill = await boundingBoxOrThrow(page, '.hero-map__pill');
      const button = await boundingBoxOrThrow(page, '.hero-map .app-map__btn');
      const logo = await boundingBoxOrThrow(page, '.hero-map .app-map__maptiler-logo');
      const attribution = await boundingBoxOrThrow(page, '.hero-map .leaflet-control-attribution');
      expect(rectsOverlap(pill, logo)).toBe(false);
      expect(rectsOverlap(pill, attribution)).toBe(false);
      expect(rectsOverlap(button, logo)).toBe(false);
      expect(rectsOverlap(button, attribution)).toBe(false);
    };

    // Desktop (1440x900 — the same width frontend-dev measured).
    await page.setViewportSize({ width: 1440, height: 900 });
    await assertNoOverlap();

    // Mobile (390x844, <1024px — the same width frontend-dev measured; the
    // full-width, 196px-tall panel).
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.hero-map')).toHaveCSS('height', '196px');
    await assertNoOverlap();
  });
});

/**
 * The map is always constructed `[interactive]="false"` (a frozen thumbnail
 * — see `hero-map.component.ts`'s class doc comment) with
 * `[markerVariant]="'twinkle'"` (decorative dots, never a tab stop — see
 * `MapComponent.markerVariant`'s own doc comment). Neither
 * `HomeHeroMapComponent` nor a frozen `app-map` adds any focus stop of its
 * OWN besides the opt-in button itself: no marker (`role="button"`/
 * `tabIndex=0`, the 'brand' variant only), no zoom stack (`<button>`,
 * `interactive`-gated), no touch scroll-gate (`role="button"`/
 * `tabindex="0"`, also `interactive`-gated). The opt-in button IS a real,
 * deliberate `<button>` — "the ONE intentional tab stop this panel adds" per
 * `HomeHeroMapComponent`'s own class doc comment — and hides itself once
 * granted, so it disappears from the tab order the moment there's nothing
 * left to opt into.
 *
 * `app-map` ALSO legitimately renders a handful of plain `<a href>` links
 * regardless of `interactive` — Leaflet's own attribution control text (the
 * "Leaflet" link plus one link per tile-attribution string) and the MapTiler
 * logo — all licence-mandated (see `map.component.ts`'s class doc comment)
 * and all naturally focusable simply by having an `href`, with no `tabindex`
 * attribute of their own. Those are correct, expected tab stops too, so this
 * spec deliberately does not count or restrict them — it only asserts that
 * nothing else app-added is focusable beyond the one opt-in button, and that
 * a real Tab traversal starting just before the map eventually leaves it
 * rather than cycling forever.
 */
test.describe('Home hero map — keyboard focus', () => {
  test('the opt-in button is the only app-added tab stop, and nothing traps keyboard focus', async ({
    page,
    context,
  }) => {
    await mockTiles(page);
    await context.clearPermissions();
    await mockApi(page, {
      mapPins: [e2eMapPin({ id: 'p1' }), e2eMapPin({ id: 'p2', latitude: 40.2, longitude: 44.53 })],
      mapPinsTruncated: false,
    });

    await page.goto('/');
    await expect(page.locator('.hero-map')).toBeVisible();
    // Wait for the licence-required attribution link to be present — proof
    // the real Leaflet map (and its attribution control) has actually
    // mounted before the focus assertions below run.
    await expect(page.locator('.hero-map .leaflet-control-attribution a').first()).toBeVisible();

    // Frozen (`interactive: false`) — this component's own zoom stack must
    // never render at all.
    await expect(page.locator('.hero-map .app-map__zoom-stack')).toHaveCount(0);

    // Exactly one app-added focusable element anywhere inside the hero
    // map — the opt-in button. No marker, no gate, nothing else.
    const appAddedFocusable = page.locator(
      '.hero-map button, .hero-map [tabindex], .hero-map [role="button"]',
    );
    await expect(appAddedFocusable).toHaveCount(1);
    await expect(appAddedFocusable.first()).toHaveClass(/app-map__btn/);

    // Real Tab traversal: starting just before the map in document order,
    // focus may pass through the licence-required attribution/logo links and
    // the one legitimate opt-in button, but must never land on anything else
    // matching a marker/button/gate pattern, and must eventually leave
    // `.hero-map` rather than cycling forever — proof there is no keyboard
    // trap, not just that the static markup has a bounded number of stops.
    await page.locator('.home__hero-search-filter').focus();
    let escaped = false;
    for (let i = 0; i < 10 && !escaped; i++) {
      await page.keyboard.press('Tab');
      const activeInfo = await page.evaluate(() => {
        const heroMap = document.querySelector('.hero-map');
        const active = document.activeElement;
        const isOptInButton = !!active && active.classList.contains('app-map__btn');
        return {
          escaped: !!heroMap && !!active && !heroMap.contains(active),
          isIllegitimateControl:
            !!active &&
            !isOptInButton &&
            (active.tagName === 'BUTTON' ||
              active.getAttribute('role') === 'button' ||
              active.hasAttribute('tabindex')),
        };
      });
      if (activeInfo.escaped) {
        escaped = true;
      } else {
        expect(activeInfo.isIllegitimateControl).toBe(false);
      }
    }
    expect(escaped).toBe(true);
  });
});
