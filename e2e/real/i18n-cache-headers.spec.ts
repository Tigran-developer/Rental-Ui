import { expect, test } from '@playwright/test';

import { UI_URL, assertDockerStack } from '../support/real-stack';

/**
 * Regression test for the dorent.am stale-translations incident (confirmed
 * 2026-08-14): production nginx sent an EMPTY Cache-Control for
 * `/i18n/{lang}.json` (matched neither the content-hashed-asset regex block
 * nor the `/index.html` block), so browsers applied heuristic caching and
 * could keep serving days-old translations after a deploy. Because
 * `index.html` is `no-cache` and JS is content-hashed, every deploy shipped
 * NEW code against OLD translations — the admin console redesign added many
 * `admin.*` keys, so returning visitors saw raw translation keys instead of
 * text.
 *
 * The fix has two halves and each needs a different layer:
 *  - `app.config.ts` appends a per-build `?v=` stamp so every build is a new
 *    URL — covered by a unit test (`app.config.spec.ts`), because it is pure
 *    TypeScript with no server involved.
 *  - `nginx.conf` adds an explicit `location ^~ /i18n/` block sending
 *    `Cache-Control: no-cache`. This is a response HEADER from the real
 *    nginx process — no unit test can see it (TestBed never talks to nginx),
 *    and the mocked e2e tier stubs the network layer entirely (M-013's exact
 *    blind spot: the layer everyone fakes is the layer nobody tests). This
 *    file closes that gap directly against the REAL docker nginx that is
 *    built from the SAME `nginx.conf` shipped to production (`Rental-Ui/
 *    Dockerfile`: `COPY nginx.conf /etc/nginx/conf.d/default.conf`).
 *
 * Deliberately an API-level check, not a browser journey: the bug is a
 * response header, which a direct HTTP request proves for all three
 * languages at once, cheaper and more stable than asserting anything through
 * a page load (mirrors `real/api-contract-conformance.spec.ts`).
 *
 * Also asserts the `^~` prefix match still wins with a `?v=` query string
 * appended, and that it does NOT catch `/index.html` or a content-hashed
 * asset — the two adjacent cache rules nginx.conf explicitly must not
 * disturb, and the exact ordering hazard the `^~` comment in nginx.conf
 * warns about (a plain prefix match would lose to the `~*` regex asset
 * block, which lists `.svg`).
 */
test.describe('i18n Cache-Control (real nginx)', () => {
  test.beforeEach(async ({ request }) => {
    await assertDockerStack(request);
  });

  for (const lang of ['en', 'ru', 'hy']) {
    test(`GET /i18n/${lang}.json is served with Cache-Control: no-cache`, async ({ request }) => {
      const res = await request.get(`${UI_URL}/i18n/${lang}.json`);
      expect(res.ok(), `/i18n/${lang}.json must be reachable`).toBe(true);
      expect(res.headers()['cache-control']).toBe('no-cache');
    });
  }

  test('a build-stamped ?v= query string does not defeat the no-cache rule', async ({ request }) => {
    const res = await request.get(`${UI_URL}/i18n/en.json?v=smoke-test-stamp`);
    expect(res.ok()).toBe(true);
    expect(res.headers()['cache-control']).toBe('no-cache');
  });

  test('adjacent cache rules are untouched: index.html stays no-cache, a hashed asset stays immutable', async ({
    request,
  }) => {
    const shell = await request.get(`${UI_URL}/index.html`);
    expect(shell.ok()).toBe(true);
    expect(shell.headers()['cache-control']).toBe('no-cache');

    const favicon = await request.get(`${UI_URL}/favicon.ico`);
    expect(favicon.ok()).toBe(true);
    expect(favicon.headers()['cache-control']).toContain('immutable');
  });
});
