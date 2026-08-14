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
  /** GET /api/admin/listings/pending — legacy unpaged queue, superseded by `adminListings` below. */
  pendingListings?: unknown[];
  /**
   * The Phase-1 admin console moderation queue's working set — items shaped
   * by `e2eAdminListing()` (each carries a `status`: `PendingApproval` |
   * `Approved` | `Rejected`). Backs THREE endpoints from one seed, mutated
   * in place as the journey acts, so a page's `GET /api/admin/listings`
   * refetch after a decision (`AdminModerationEffects.refetchAfterDecision$`)
   * sees the outcome of the mutation rather than the original seed:
   *   - `GET  /api/admin/listings?status=` — filtered by `status`, with
   *     `counts` recomputed from the working set every call.
   *   - `GET  /api/admin/listings/:id` — the matching item plus its `status`.
   *   - `POST /api/admin/listings/:id/approve` / `/reject` — flips the
   *     item's `status` (unless `adminApprove`/`adminReject` below force a
   *     failure, in which case the working set is left untouched so the
   *     UI's own optimistic-rollback is what's under test, not the mock).
   */
  adminListings?: unknown[];
  /** POST /api/admin/listings/:id/approve outcome — defaults to success; set `status: 500` to exercise the optimistic-rollback path. */
  adminApprove?: { status?: number; body?: unknown };
  /** POST /api/admin/listings/:id/reject outcome — defaults to success; set `status: 500` to exercise the optimistic-rollback path. */
  adminReject?: { status?: number; body?: unknown };
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
  /** POST /api/reports outcome — defaults to a successful created report. Set `status: 409` +
   *  `body.errorCode: 'report.already_reported'` to exercise the calm duplicate-report state
   *  (see `report-dialog.component.ts`'s class doc comment — that response is NOT an error). */
  submitReport?: { status?: number; body?: unknown };
  /**
   * The admin console Categories screen's working set (Phase 2), shaped by
   * `e2eAdminCategory()`. Backs `GET /api/admin/categories` and is mutated in place by
   * create/rename/visibility/reorder/delete — same stateful convention as `adminListings`
   * above — so a post-mutation refetch sees the outcome, not the original seed.
   */
  adminCategories?: unknown[];
  /** DELETE /api/admin/categories/:id outcome override — defaults to success. Set `status` to
   *  exercise a rejected delete (e.g. `admin.category_reassign_required`). */
  adminCategoryDelete?: { status?: number; body?: unknown };
  /**
   * The admin console Users screen's working set (Phase 3), shaped by `e2eAdminUser()`. Backs
   * `GET /api/admin/users` and is mutated in place by verify/suspend/reactivate.
   */
  adminUsers?: unknown[];
  /**
   * The admin console Reports & flags screen's working set (Phase 4), shaped by
   * `e2eAdminReport()`. Backs `GET /api/admin/reports` and is mutated in place by
   * resolve/dismiss/reopen.
   */
  adminReports?: unknown[];
  /** POST /api/admin/reports/:id/resolve outcome — defaults to success; set `status: 500` to
   *  exercise the report detail dialog's own rollback (the working set is left untouched so the
   *  UI's optimistic-rollback + `resolveReportFailure` handling is what's under test). */
  adminReportResolve?: { status?: number; body?: unknown };
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function mockApi(page: Page, seed: ApiSeed = {}): Promise<void> {
  // Mutable working copy of the admin moderation queue — a plain array
  // closed over by the route handler below (NOT `seed.adminListings`
  // itself), so approve/reject mutate state that outlives a single request
  // but never the seed the next test starts from. See the `adminListings`
  // doc comment on `ApiSeed` for why this needs to be stateful at all.
  const adminListingsState: Record<string, unknown>[] = (seed.adminListings ?? []).map(
    (item) => ({ ...(item as Record<string, unknown>) }),
  );

  function adminQueueCounts(): { pending: number; approved: number; rejected: number } {
    return {
      pending: adminListingsState.filter((i) => i['status'] === 'PendingApproval').length,
      approved: adminListingsState.filter((i) => i['status'] === 'Approved').length,
      rejected: adminListingsState.filter((i) => i['status'] === 'Rejected').length,
    };
  }

  // Mutable working copy of the admin Categories console (Phase 2) — same convention as
  // `adminListingsState` above.
  const adminCategoriesState: Record<string, unknown>[] = (seed.adminCategories ?? []).map(
    (item) => ({ ...(item as Record<string, unknown>) }),
  );

  function adminCategoriesSummary(): {
    totalCategories: number;
    visibleCount: number;
    totalListedToys: number;
  } {
    return {
      totalCategories: adminCategoriesState.length,
      visibleCount: adminCategoriesState.filter((c) => c['isVisible'] === true).length,
      totalListedToys: adminCategoriesState.reduce(
        (sum, c) =>
          sum + (typeof c['listingCount'] === 'number' ? (c['listingCount'] as number) : 0),
        0,
      ),
    };
  }

  // Mutable working copy of the admin Users console (Phase 3) — same convention as
  // `adminListingsState` above.
  const adminUsersState: Record<string, unknown>[] = (seed.adminUsers ?? []).map((item) => ({
    ...(item as Record<string, unknown>),
  }));

  function adminUsersSummary(): {
    totalUsers: number;
    verifiedCount: number;
    pendingCount: number;
    suspendedCount: number;
  } {
    return {
      totalUsers: adminUsersState.length,
      verifiedCount: adminUsersState.filter((u) => u['isIdConfirmed'] === true).length,
      pendingCount: adminUsersState.filter((u) => u['status'] === 'Pending').length,
      suspendedCount: adminUsersState.filter((u) => u['status'] === 'Suspended').length,
    };
  }

  // Mutable working copy of the admin Reports & flags console (Phase 4) — same convention as
  // `adminListingsState` above.
  const adminReportsState: Record<string, unknown>[] = (seed.adminReports ?? []).map((item) => ({
    ...(item as Record<string, unknown>),
  }));

  // `scope` is the targetType/targetId-filtered working set (or the whole state when no target
  // filter is active) — counts respect that scope but never the status tab, matching
  // `AdminReportQueueResponse`'s contract (see `reports-page.component.ts`'s doc comment).
  function adminReportsCounts(
    scope: Record<string, unknown>[],
  ): { open: number; resolved: number; dismissed: number; all: number } {
    return {
      open: scope.filter((r) => r['status'] === 'Open').length,
      resolved: scope.filter((r) => r['status'] === 'Resolved').length,
      dismissed: scope.filter((r) => r['status'] === 'Dismissed').length,
      all: scope.length,
    };
  }

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

    // POST /api/admin/listings/{id}/approve — checked before the detail
    // regex below so "approve" is never mistaken for a listing id.
    const adminApproveId = pathname.match(/^\/api\/admin\/listings\/([^/]+)\/approve$/)?.[1];
    if (adminApproveId && method === 'POST') {
      const status = seed.adminApprove?.status ?? 200;
      if (status < 400) {
        const item = adminListingsState.find((i) => i['id'] === adminApproveId);
        if (item) {
          item['status'] = 'Approved';
          item['rejectionReasonCode'] = null;
          item['rejectionNote'] = null;
          item['moderatedAt'] = new Date().toISOString();
        }
      }
      return json(route, status, seed.adminApprove?.body ?? {});
    }

    // POST /api/admin/listings/{id}/reject — same ordering reason as approve.
    const adminRejectId = pathname.match(/^\/api\/admin\/listings\/([^/]+)\/reject$/)?.[1];
    if (adminRejectId && method === 'POST') {
      const status = seed.adminReject?.status ?? 200;
      if (status < 400) {
        const body = request.postDataJSON() as { reasonCode?: string; note?: string | null } | null;
        const item = adminListingsState.find((i) => i['id'] === adminRejectId);
        if (item) {
          item['status'] = 'Rejected';
          item['rejectionReasonCode'] = body?.reasonCode ?? null;
          item['rejectionNote'] = body?.note ?? null;
          item['moderatedAt'] = new Date().toISOString();
        }
      }
      return json(route, status, seed.adminReject?.body ?? {});
    }

    // GET /api/admin/listings/{id} — the inspect dossier. Excludes "pending",
    // which the legacy unpaged-queue block above already claimed.
    const adminDetailId = pathname.match(/^\/api\/admin\/listings\/([^/]+)$/)?.[1];
    if (adminDetailId && adminDetailId !== 'pending' && method === 'GET') {
      const item = adminListingsState.find((i) => i['id'] === adminDetailId);
      return json(route, item ? 200 : 404, item ?? { detail: 'Not found' });
    }

    // GET /api/admin/listings?status=&page=&pageSize=&search= — the Phase-1
    // review-page queue. `counts` are recomputed from the whole working set
    // (matches the real endpoint: unaffected by which tab/page is selected).
    if (pathname.endsWith('/api/admin/listings') && method === 'GET') {
      const statusParam = new URL(request.url()).searchParams.get('status');
      const items = statusParam
        ? adminListingsState.filter((i) =>
            statusParam === 'Pending' ? i['status'] === 'PendingApproval' : i['status'] === statusParam,
          )
        : adminListingsState;
      return json(route, 200, {
        items,
        page: 1,
        pageSize: 20,
        totalCount: items.length,
        totalPages: 1,
        counts: adminQueueCounts(),
      });
    }

    // ── Admin Categories console (Phase 2) ──────────────────────────────

    // POST /api/admin/categories — create. Exact suffix + method match so it
    // never collides with the GET list below.
    if (pathname.endsWith('/api/admin/categories') && method === 'POST') {
      const body = (request.postDataJSON() as Record<string, unknown> | null) ?? {};
      const name = typeof body['name'] === 'string' ? body['name'] : '';
      const newCategory: Record<string, unknown> = {
        id: `admin-category-e2e-${adminCategoriesState.length + 1}`,
        name,
        slug: name.toLowerCase().trim().replace(/\s+/g, '-'),
        iconName: typeof body['iconName'] === 'string' && body['iconName'] ? body['iconName'] : null,
        colorHex: typeof body['colorHex'] === 'string' && body['colorHex'] ? body['colorHex'] : null,
        displayOrder: adminCategoriesState.length,
        isVisible: true,
        listingCount: 0,
      };
      adminCategoriesState.push(newCategory);
      return json(route, 200, newCategory);
    }

    // PATCH /api/admin/categories/reorder — checked BEFORE the generic
    // PATCH-by-id regex below, which would otherwise mistake "reorder" for a
    // category id (same reasoning as the admin-listings approve/reject
    // ordering above).
    if (pathname.endsWith('/api/admin/categories/reorder') && method === 'PATCH') {
      const body = (request.postDataJSON() as { orderedIds?: string[] } | null) ?? {};
      const orderedIds = body.orderedIds ?? [];
      const byId = new Map(adminCategoriesState.map((c) => [c['id'] as string, c]));
      const reordered = orderedIds
        .map((id) => byId.get(id))
        .filter((c): c is Record<string, unknown> => c !== undefined);
      reordered.forEach((c, index) => {
        c['displayOrder'] = index;
      });
      adminCategoriesState.length = 0;
      adminCategoriesState.push(...reordered);
      return json(route, 200, adminCategoriesState);
    }

    // PATCH /api/admin/categories/{id}/visibility
    const categoryVisibilityId = pathname.match(
      /^\/api\/admin\/categories\/([^/]+)\/visibility$/,
    )?.[1];
    if (categoryVisibilityId && method === 'PATCH') {
      const body = (request.postDataJSON() as { isVisible?: boolean } | null) ?? {};
      const item = adminCategoriesState.find((c) => c['id'] === categoryVisibilityId);
      if (item) item['isVisible'] = body.isVisible === true;
      return json(route, item ? 200 : 404, item ?? { detail: 'Not found' });
    }

    // DELETE /api/admin/categories/{id}?reassignToCategoryId= and
    // PATCH /api/admin/categories/{id} (generic rename/restyle) share the same
    // by-id regex, checked after /reorder and /visibility above.
    const categoryDetailId = pathname.match(/^\/api\/admin\/categories\/([^/]+)$/)?.[1];
    if (categoryDetailId && method === 'DELETE') {
      const status = seed.adminCategoryDelete?.status ?? 200;
      if (status < 400) {
        const index = adminCategoriesState.findIndex((c) => c['id'] === categoryDetailId);
        if (index >= 0) adminCategoriesState.splice(index, 1);
      }
      return json(route, status, seed.adminCategoryDelete?.body ?? {});
    }
    if (categoryDetailId && method === 'PATCH') {
      const body = (request.postDataJSON() as Record<string, unknown> | null) ?? {};
      const item = adminCategoriesState.find((c) => c['id'] === categoryDetailId);
      if (item) {
        if (typeof body['name'] === 'string' && body['name']) item['name'] = body['name'];
        if ('iconName' in body) item['iconName'] = body['iconName'] || null;
        if ('colorHex' in body) item['colorHex'] = body['colorHex'] || null;
      }
      return json(route, item ? 200 : 404, item ?? { detail: 'Not found' });
    }

    // GET /api/admin/categories — the queue list + summary.
    if (pathname.endsWith('/api/admin/categories') && method === 'GET') {
      return json(route, 200, {
        items: adminCategoriesState,
        summary: adminCategoriesSummary(),
      });
    }

    // ── Admin Users console (Phase 3) ────────────────────────────────────

    // POST /api/admin/users/{id}/{verify,suspend,reactivate} — checked before
    // the GET-by-id regex below (different method, but kept first for the
    // same readability convention as admin-listings approve/reject).
    const userMutationMatch = pathname.match(
      /^\/api\/admin\/users\/([^/]+)\/(verify|suspend|reactivate)$/,
    );
    if (userMutationMatch && method === 'POST') {
      const userId = userMutationMatch[1];
      const action = userMutationMatch[2];
      const item = adminUsersState.find((u) => u['id'] === userId);
      if (item) {
        if (action === 'verify') item['isIdConfirmed'] = true;
        if (action === 'suspend') item['status'] = 'Suspended';
        if (action === 'reactivate') item['status'] = 'Active';
      }
      return json(route, item ? 200 : 404, item ?? { detail: 'Not found' });
    }

    // GET /api/admin/users/{id} — the profile dialog's detail fetch.
    const userDetailId = pathname.match(/^\/api\/admin\/users\/([^/]+)$/)?.[1];
    if (userDetailId && method === 'GET') {
      const item = adminUsersState.find((u) => u['id'] === userDetailId);
      return json(route, item ? 200 : 404, item ?? { detail: 'Not found' });
    }

    // GET /api/admin/users?status=&search=&sort=&page=&pageSize= — the queue.
    // `status` is the loose "all"/"pending"/"suspended" filter value — "active"
    // is deliberately never sent by the UI (see `AdminUserStatusFilter`).
    if (pathname.endsWith('/api/admin/users') && method === 'GET') {
      const statusParam = new URL(request.url()).searchParams.get('status');
      const items =
        statusParam && statusParam !== 'all'
          ? adminUsersState.filter(
              (u) => (u['status'] as string)?.toLowerCase() === statusParam.toLowerCase(),
            )
          : adminUsersState;
      return json(route, 200, {
        items,
        page: 1,
        pageSize: 20,
        totalCount: items.length,
        totalPages: 1,
        summary: adminUsersSummary(),
      });
    }

    // ── Admin Reports & flags console (Phase 4) ──────────────────────────

    // POST /api/admin/reports/{id}/{resolve,dismiss,reopen}
    const reportMutationMatch = pathname.match(
      /^\/api\/admin\/reports\/([^/]+)\/(resolve|dismiss|reopen)$/,
    );
    if (reportMutationMatch && method === 'POST') {
      const reportId = reportMutationMatch[1];
      const action = reportMutationMatch[2];
      const body = (request.postDataJSON() as { note?: string } | null) ?? {};
      const status = action === 'resolve' ? (seed.adminReportResolve?.status ?? 200) : 200;
      if (status >= 300) {
        return json(route, status, seed.adminReportResolve?.body ?? {});
      }
      const item = adminReportsState.find((r) => r['id'] === reportId);
      if (item) {
        if (action === 'resolve') {
          item['status'] = 'Resolved';
          item['resolvedAt'] = new Date().toISOString();
          item['resolutionNote'] = body.note ?? null;
        } else if (action === 'dismiss') {
          item['status'] = 'Dismissed';
          item['resolvedAt'] = new Date().toISOString();
          item['resolutionNote'] = body.note ?? null;
        } else {
          item['status'] = 'Open';
          item['resolvedAt'] = null;
          item['resolutionNote'] = null;
        }
      }
      return json(route, item ? 200 : 404, item ?? { detail: 'Not found' });
    }

    // GET /api/admin/reports/{id} — the detail dialog.
    const reportDetailId = pathname.match(/^\/api\/admin\/reports\/([^/]+)$/)?.[1];
    if (reportDetailId && method === 'GET') {
      const item = adminReportsState.find((r) => r['id'] === reportDetailId);
      return json(route, item ? 200 : 404, item ?? { detail: 'Not found' });
    }

    // GET /api/admin/reports?status=&search=&targetType=&targetId=&page=&pageSize=
    // — the `userId` deep link from the Users screen arrives here translated
    // into targetType=User&targetId=<id> (see `reports-page.component.ts`).
    if (pathname.endsWith('/api/admin/reports') && method === 'GET') {
      const params = new URL(request.url()).searchParams;
      const statusParam = params.get('status');
      const targetType = params.get('targetType');
      const targetId = params.get('targetId');

      const scoped =
        targetType && targetId
          ? adminReportsState.filter(
              (r) => r['targetType'] === targetType && r['targetId'] === targetId,
            )
          : adminReportsState;
      const items =
        statusParam && statusParam !== 'all'
          ? scoped.filter((r) => (r['status'] as string)?.toLowerCase() === statusParam.toLowerCase())
          : scoped;

      return json(route, 200, {
        items,
        page: 1,
        pageSize: 20,
        totalCount: items.length,
        totalPages: 1,
        counts: adminReportsCounts(scoped),
      });
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

    // POST /api/reports — user-facing report submission (listing details /
    // public profile / chat), distinct from the `/api/admin/reports` triage
    // queue above.
    if (pathname.endsWith('/api/reports') && method === 'POST') {
      const status = seed.submitReport?.status ?? 200;
      return json(
        route,
        status,
        seed.submitReport?.body ?? {
          id: 'report-e2e-1',
          targetType: 'Listing',
          targetId: 'listing-e2e-1',
          targetLabel: 'E2E Wooden Train Set',
          reasonCode: 'other',
          detail: null,
          severity: 'Low',
          status: 'Open',
          createdAt: '2026-08-01T10:00:00.000Z',
        },
      );
    }

    if (pathname.endsWith('/api/categories') && method === 'GET') {
      return json(
        route,
        200,
        seed.categories ?? [
          { id: 'cat-e2e-1', name: 'Toys', slug: 'toys', iconName: 'tag', colorHex: '#FFE6CC' },
        ],
      );
    }

    if (pathname.endsWith('/api/districts') && method === 'GET') {
      return json(route, 200, seed.districts ?? e2eDistricts());
    }

    // Anything else: keep the app happy with a benign success.
    if (method === 'GET') return json(route, 200, []);
    return json(route, 200, {});
  });
}
