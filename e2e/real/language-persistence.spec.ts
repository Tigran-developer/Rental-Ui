import { expect, test } from '@playwright/test';

import { ApiContract } from '../../src/app/api/api-contract';
import {
  ACCOUNTS,
  UI_URL,
  apiSetPreferredLanguage,
  assertDockerStack,
  loginViaDialog,
} from '../support/real-stack';

/**
 * Real-stack coverage for per-user UI language persistence (four behaviours,
 * see the feature spec). Unit suites already pin the branch logic in
 * isolation — `language.service.spec.ts` (`applyFromUser` no-ops on
 * null/unknown, `use()` always writes localStorage) and
 * `auth.effects.spec.ts` (`persistPreferredLanguage$` only fires the PUT
 * when `selectIsAuthenticated`) — but those specs answer to fakes: an
 * `httpMock` that only ever proves "the UI called `.put()`", never that a
 * real PUT reaches a real endpoint, persists through a real DbContext, and
 * comes back out on a real GET (M-013: the layer everyone fakes is the layer
 * nobody tests). This spec closes exactly that gap for the two behaviours
 * that cross the network boundary:
 *
 *  - signed-in switch persists to the backend AND survives a reload with the
 *    local cache wiped (proves the value on reload came from the server, not
 *    from `localStorage` echoing itself back)
 *  - a guest's switch never calls the backend at all
 *
 * Deliberately NOT covered here (no real-stack risk, already unit-tested):
 *  - "no saved language -> keep current, never auto-persist" is a pure
 *    null-check in `LanguageService.applyFromUser` with no network branch;
 *    `language.service.spec.ts` pins it directly and cheaper. It also can't
 *    be exercised with the seeded accounts, which the dev seed always gives
 *    `PreferredLanguage = "en"` (see DevelopmentSeedRunner.cs) — there is no
 *    seed invariant for "no saved language" to rely on.
 *  - 400 on an unknown language code, blocked-user 403: HTTP contract,
 *    covered by `PreferredLanguageHttpTests.cs` (xUnit, WebApplicationFactory).
 */

const LANGUAGE_STORAGE_KEY = 'stayfinder.lang';
const HY_NATIVE = 'Հայերեն';
const HY_LOGOUT_TEXT = 'Ելք'; // profile.nav.logout, hy — proves the DOM actually re-translated.

test.describe('Per-user language persistence (real stack)', () => {
  test('signed-in switch persists to the backend and survives a reload with localStorage cleared', async ({
    page,
    request,
  }) => {
    await test.step('guard: docker stack is what is actually serving :4200/:8080', async () => {
      await assertDockerStack(request);
    });

    await test.step('self-heal: renter starts from the seeded baseline (en)', async () => {
      await apiSetPreferredLanguage(request, ACCOUNTS.renter, 'en');
    });

    await test.step('log in and open the profile Settings language menu', async () => {
      await loginViaDialog(page, ACCOUNTS.renter);
      await page.goto('/profile');
      await expect(page.locator('.profile-page__desktop-only .profile-page__menu-meta')).toHaveText('English');
    });

    await test.step('switch to Armenian: UI translates immediately and a real PUT persists it', async () => {
      await page.locator('.profile-page__desktop-only .profile-page__menu-row').first().click();

      // The docker UI build is a same-origin bundle (environment.prod.ts apiBaseUrl: '')
      // routed through nginx's /api/ proxy_pass (nginx.conf) — browser-originated traffic
      // hits UI_URL (:4200), never the API container's :8080 directly. API_URL is only
      // for Node-side APIRequestContext calls (apiLogin, apiSetPreferredLanguage) that
      // bypass the proxy on purpose.
      const [putResponse] = await Promise.all([
        page.waitForResponse(
          (res) =>
            res.url() === `${UI_URL}${ApiContract.auth.updatePreferredLanguage}` &&
            res.request().method() === 'PUT',
        ),
        page
          .locator('.profile-page__desktop-only .profile-page__lang-option', { hasText: HY_NATIVE })
          .click(),
      ]);

      expect(putResponse.ok(), 'PUT /api/auth/me/preferred-language must succeed').toBe(true);
      const putBody = (await putResponse.json()) as { preferredLanguage?: string };
      expect(putBody.preferredLanguage).toBe('hy');

      // UI/localStorage apply immediately (LanguageService.use), independent of the PUT.
      await expect(page.locator('.profile-page__menu-row--danger')).toHaveText(HY_LOGOUT_TEXT);
      await expect
        .poll(() => page.evaluate((key) => localStorage.getItem(key), LANGUAGE_STORAGE_KEY))
        .toBe('hy');
    });

    await test.step('reload with the local language cache wiped: the app re-derives hy from the server', async () => {
      const tokenBefore = await page.evaluate(() => localStorage.getItem('auth_token'));
      expect(tokenBefore, 'auth token must survive so the reload still hydrates a logged-in user').toBeTruthy();

      await page.evaluate((key) => localStorage.removeItem(key), LANGUAGE_STORAGE_KEY);
      await expect
        .poll(() => page.evaluate((key) => localStorage.getItem(key), LANGUAGE_STORAGE_KEY))
        .toBeNull();

      const [meResponse] = await Promise.all([
        page.waitForResponse(
          (res) => res.url() === `${UI_URL}${ApiContract.auth.currentUser}` && res.request().method() === 'GET',
        ),
        page.reload(),
      ]);
      expect(meResponse.ok(), 'GET /api/auth/me must succeed on reload').toBe(true);
      const meBody = (await meResponse.json()) as { preferredLanguage?: string | null };
      expect(meBody.preferredLanguage, 'sanity check: the server must actually hold hy').toBe('hy');

      // If this came from localStorage it would be English (cache was wiped above) —
      // seeing hy here proves loadCurrentUserSuccess -> applyServerLanguage$ -> applyFromUser fired.
      await expect(page.locator('.profile-page__menu-row--danger')).toHaveText(HY_LOGOUT_TEXT);
      await expect
        .poll(() => page.evaluate((key) => localStorage.getItem(key), LANGUAGE_STORAGE_KEY))
        .toBe('hy');
    });

    await test.step('cleanup: restore the seeded baseline for the next run', async () => {
      await apiSetPreferredLanguage(request, ACCOUNTS.renter, 'en');
    });
  });

  test('guest switch is localStorage-only: no PUT to the backend', async ({ page }) => {
    await test.step('guard: docker stack is what is actually serving :4200/:8080', async () => {
      await assertDockerStack(page.request);
    });

    const preferredLanguageRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url() === `${UI_URL}${ApiContract.auth.updatePreferredLanguage}`) {
        preferredLanguageRequests.push(req.method());
      }
    });

    await test.step('as a guest, switch to Armenian via the header selector', async () => {
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();

      // `<app-language-selector>` renders twice on the Home page (desktop header nav +
      // a second instance in the mobile top row inside <main> — both present in the DOM
      // regardless of viewport, only CSS toggles which is visible), so an unscoped
      // locator is ambiguous even under the 'real' project's desktop viewport. Scope to
      // the header (banner landmark) specifically — the guest-facing entry point this
      // journey means to exercise.
      const header = page.getByRole('banner');
      await header.locator('.lang-selector__trigger').click();
      await header.locator('.lang-selector__row', { hasText: HY_NATIVE }).click();

      await expect(header.locator('.lang-selector__code')).toHaveText('hy');
      await expect
        .poll(() => page.evaluate((key) => localStorage.getItem(key), LANGUAGE_STORAGE_KEY))
        .toBe('hy');
    });

    await test.step('no server call was ever made for the guest switch', async () => {
      // NgRx effects resolve the isAuthenticated filter synchronously (no async gap before
      // the mergeMap would fire), and networkidle gives any stray fetch a real chance to
      // surface before we assert on the collected request log.
      await page.waitForLoadState('networkidle');
      expect(preferredLanguageRequests).toEqual([]);
    });

    // No cleanup needed: guest language is localStorage-only, scoped to this browser
    // context, and never touches server state.
  });
});
