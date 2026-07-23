import { expect, test } from '@playwright/test';

import { API_URL, TOY_KITCHEN, assertDockerStack } from '../support/real-stack';

/**
 * Root-cause regression test for the `/listings` search contract-drift bug
 * (same class as M-020, fixed 2026-07-24): the UI sent `?title=<query>` but
 * `ListingsQueryFilter` had no `Title` field, so ASP.NET model binding
 * silently dropped the unknown query param and `GET /api/listings?title=...`
 * behaved identically to the unfiltered call — search always returned every
 * Approved listing. Fixed by sending `?search=` and matching the real
 * `ListingsQueryFilter.Search` field
 * (`Title.Contains || Description.Contains`, see
 * `ListingsQueryService.cs`).
 *
 * Why real-stack, not mocked e2e: the mocked tier's `api-mock.ts` answers
 * every `/api/**` request from an inline fixture — a test built on it can
 * only prove "the UI sends the param we wrote down", which is exactly the
 * property that was already true (and already unit-pinned in
 * `listings-api.service.spec.ts`) while the backend silently dropped it. The
 * bug lived in whether the REAL API route (`ListingsController.GetListings`
 * -> `ListingsQueryFilter` model binding -> `ListingsQueryService`) actually
 * narrows the result set. Only a real, un-mocked backend call can prove that.
 *
 * Why API-level, not a full browser search journey: the catastrophic-if-
 * broken property — "typing a query returns a strictly narrower, correctly-
 * filtered result set" — is a server contract property, not a rendering one.
 * Asserting it directly against `GET /api/listings` proves the real backend
 * behaviour without paying for browser flakiness on an unrelated UI layer
 * (typing, debounce, pagination rendering are already covered elsewhere: see
 * e2e/README.md coverage map). Precedent: `api-contract-conformance.spec.ts`
 * makes the same choice for the sibling profile.me incident.
 *
 * Determinism: relies only on dev-seed invariants — the fixed
 * "Wooden Toy Kitchen Set" listing (TOY_KITCHEN, Approved) and the fixed
 * "LEGO Duplo Starter Set" listing, both from `DevelopmentSeedData.Listings`.
 * Neither listing's title/description ever changes at runtime, so the
 * "kitchen" search term's match/no-match outcome cannot drift. No booking or
 * mutation state involved — safe to re-run indefinitely.
 */

const LEGO_DUPLO = {
  id: '77777777-0001-4000-9000-000000000001',
  title: 'LEGO Duplo Starter Set',
} as const;

interface ListingPreview {
  readonly id: string;
  readonly title: string;
}

interface PagedResult {
  readonly items: ListingPreview[];
  readonly totalCount: number;
}

async function getListings(
  request: import('@playwright/test').APIRequestContext,
  params: Record<string, string>,
): Promise<PagedResult> {
  const res = await request.get(`${API_URL}/api/listings`, {
    params: { page: '1', pageSize: '100', ...params },
  });
  expect(res.ok(), `GET /api/listings?${new URLSearchParams(params)} must succeed`).toBe(true);
  return (await res.json()) as PagedResult;
}

test.describe('Listings search filter (real stack)', () => {
  test('search narrows the result set and excludes non-matching listings', async ({ request }) => {
    await test.step('guard: docker stack is what is actually serving :4200/:8080', async () => {
      await assertDockerStack(request);
    });

    const unfiltered = await test.step('fetch the unfiltered listing set', () =>
      getListings(request, {}));

    // Sanity check on the fixtures the assertion depends on: both seed
    // invariants must be present in the unfiltered (Approved-only) list, or
    // the rest of this test would pass for the wrong reason.
    const unfilteredIds = new Set(unfiltered.items.map((i) => i.id));
    expect(
      unfilteredIds.has(TOY_KITCHEN.id),
      'seed invariant missing: "Wooden Toy Kitchen Set" must be Approved and returned unfiltered',
    ).toBe(true);
    expect(
      unfilteredIds.has(LEGO_DUPLO.id),
      'seed invariant missing: "LEGO Duplo Starter Set" must be Approved and returned unfiltered',
    ).toBe(true);

    const searched = await test.step('fetch with ?search=Kitchen', () =>
      getListings(request, { search: 'Kitchen' }));

    // The property that was broken in production: search must return a
    // STRICTLY NARROWER set than unfiltered, not "everything, unchanged".
    expect(
      searched.totalCount,
      'search must narrow the result set — a totalCount equal to unfiltered means ' +
        '?search= was silently dropped (the original contract-drift bug)',
    ).toBeLessThan(unfiltered.totalCount);

    const searchedIds = new Set(searched.items.map((i) => i.id));
    expect(searchedIds.has(TOY_KITCHEN.id), 'matching listing must be present').toBe(true);
    expect(
      searchedIds.has(LEGO_DUPLO.id),
      'non-matching listing ("LEGO Duplo Starter Set" — no "kitchen" in title or description) ' +
        'must be excluded by a real, working filter',
    ).toBe(false);
  });
});
