import { expect, test } from '@playwright/test';

import { ApiContract, type ApiPath } from '../../src/app/api/api-contract';
import { API_URL, assertDockerStack } from '../support/real-stack';

/**
 * Contract-conformance guard for the whole `ApiContract` surface.
 *
 * Root-cause regression test for the dorent.am incident (2026-07-22, fixed in
 * `2169ef6`): `ApiContract.profile.me` (`/api/profile/me`) was a client-only
 * path — the UI called it, `ProfileController` never existed on the backend,
 * and every real logged-in user hit a silent 404 (masked by a `catchError`
 * fallback in `profile.effects.ts`, so the page never *looked* broken). Ten
 * hits over 36h in nginx logs before anyone noticed; nothing in the app
 * logged it (ASP.NET request logging is off — SQL-only EF Core logs).
 *
 * Two independent gaps let a client-only path reach production:
 *  - `profile-api.service.spec.ts` (unit) pins the URL the UI calls, but its
 *    `httpMock` answers whatever the *same test* sets up — it proves "the UI
 *    asks for the path we wrote down", never "the path exists on a server".
 *  - The mocked e2e tier (`support/api-mock.ts`) stubs the network layer
 *    entirely — the identical blind spot, one layer up.
 *
 * This test closes the actual gap directly: every path declared in
 * `ApiContract` is checked against the real ASP.NET Core API's own route
 * table (its OpenAPI document), so a client-only path fails HERE instead of
 * in nginx access logs. Deliberately NOT a browser journey — no login, no
 * rendering, no UI flakiness surface — because the bug is about ROUTE
 * EXISTENCE, which an API-level check proves directly, for every endpoint at
 * once, not just `/profile`. A dedicated real-stack UI journey for the
 * profile page would only re-prove this one instance and cost far more to
 * keep stable; see e2e/README.md coverage map for where that gap is tracked
 * instead.
 *
 * Explicit scope limits (not oversights):
 *  - HTTP verb match (GET vs POST on a given path) is NOT checked —
 *    `ApiContract` only records paths, not verbs.
 *  - Authorization behaviour on the route is NOT checked.
 *  - The UI's silent-fallback masking (`mapAuthUserToProfile` in
 *    `profile.effects.ts`) is a UX/observability property, not a
 *    route-existence property, and is out of scope for this pin.
 *  - `/hubs/chat` (SignalR) is a NAMED exclusion below: hubs are not
 *    controller actions and structurally never appear in an OpenAPI
 *    document — this is a deliberate exclusion, not a silent gap.
 */

/** Real, working endpoints that structurally cannot appear in the OpenAPI
 *  document (e.g. SignalR hubs) — named exclusions, not gaps. */
const NOT_IN_OPENAPI = new Set<string>([ApiContract.chat.hub]);

/**
 * Recursively collects every path this contract declares. Path-functions are
 * invoked with a fixed placeholder segment so templated routes (`{id}`-shaped
 * on the backend) can be normalized and compared structurally without caring
 * about the actual value.
 */
function collectContractPaths(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node);
  } else if (typeof node === 'function') {
    // Every ApiContract path-function takes 1-2 string segments (id[, id]);
    // extra placeholder args are simply ignored by single-arg functions.
    out.push((node as (...args: string[]) => ApiPath)('PLACEHOLDER', 'PLACEHOLDER'));
  } else if (node && typeof node === 'object') {
    for (const value of Object.values(node)) collectContractPaths(value, out);
  }
  return out;
}

/**
 * Normalizes a path so `/api/Listings/{id}` (OpenAPI, PascalCase controller
 * name, named template) and `/api/listings/PLACEHOLDER` (ApiContract, our
 * placeholder) compare equal: lowercase throughout (ASP.NET routing is
 * case-insensitive — swagger's PascalCase reflects the C# controller/action
 * names, not a routing requirement), and any templated or placeholder
 * segment collapses to `*`.
 */
function normalize(path: string): string {
  return path
    .toLowerCase()
    .split('/')
    .map((segment) => (/^(\{.*\}|placeholder)$/.test(segment) ? '*' : segment))
    .join('/');
}

test.describe('API contract conformance (real stack)', () => {
  test('every ApiContract REST path resolves to a real backend route', async ({ request }) => {
    await test.step('guard: docker stack is what is actually serving :4200/:8080', async () => {
      await assertDockerStack(request);
    });

    const swagger = await test.step('fetch the real API route table (OpenAPI document)', async () => {
      const res = await request.get(`${API_URL}/swagger/v1/swagger.json`);
      expect(res.ok(), 'Swagger document must be reachable on the docker API (Development env)').toBe(
        true,
      );
      return (await res.json()) as { paths: Record<string, unknown> };
    });

    const backendRoutes = new Set(Object.keys(swagger.paths).map(normalize));
    // Sanity check on the check itself: a near-empty route table would make
    // "every contract path matches" true for the wrong reason (nothing to
    // compare against, e.g. swagger failed to enumerate controllers).
    expect(
      backendRoutes.size,
      'sanity check: the API must expose a non-trivial route table',
    ).toBeGreaterThan(20);

    const contractPaths = collectContractPaths(ApiContract).filter((p) => !NOT_IN_OPENAPI.has(p));
    const missing = contractPaths.filter((p) => !backendRoutes.has(normalize(p)));

    expect(
      missing,
      `ApiContract declares paths with no matching backend route (client/server contract ` +
        `drift — this is exactly the dorent.am /api/profile/me incident):\n${missing.join('\n')}`,
    ).toEqual([]);
  });
});
