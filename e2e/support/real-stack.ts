import { expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Helpers for the real-stack tier (`npm run e2e:real`). These talk to the REAL
 * docker stack — nginx UI on :4200, ASP.NET Core API on :8080, SQL Server —
 * and rely exclusively on dev-seed invariants (fixed GUIDs, demo accounts).
 * No api-mock.ts here.
 */

export const API_URL = 'http://localhost:8080';
export const UI_URL = 'http://localhost:4200';

/** Dev-seed demo accounts (idempotent seed, Development environment only). */
export const ACCOUNTS = {
  owner: { email: 'owner@rental.local', password: 'Demo1234' },
  renter: { email: 'renter@rental.local', password: 'Demo1234' },
  admin: { email: 'admin@rental.local', password: 'Demo1234' },
} as const;

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

/**
 * Seed invariant: "Wooden Toy Kitchen Set" (DevelopmentSeedData.ListingIds
 * .ToyKitchenSet), Approved, owned by owner@rental.local, 3,500 AMD/day (see
 * DevelopmentSeedData.cs — ADR-007 moved the app to dram-only pricing; this
 * was previously documented as "$9/day" before that migration). Its only
 * seeded bookings are terminal (Completed/…), so renter@ can always book it
 * once leftover bookings from crashed runs are released (see
 * releaseListingForRenter).
 *
 * `exactLatitude`/`exactLongitude` are the literal owner-dropped pin from
 * `DevelopmentSeedData.Listings` (`40.1776m, 44.5126m` — 5 Republic Square,
 * Yerevan). `ListingLocationBackfillExtensions.BackfillListingLocationsAsync`
 * runs unconditionally on every API startup and derives `PublicLatitude`/
 * `PublicLongitude` (the geohash-6 cell centroid, ADR-008) from that exact
 * pair deterministically, so the fuzzed public pair never drifts between
 * runs either — confirmed live: `40.179749, 44.511108`. Do not hand-derive
 * that value from geohash math in a test; treat it as an opaque, currently-
 * stable seed fact and assert the *relationship* (differs from exact, same
 * across callers) rather than recomputing it.
 */
export const TOY_KITCHEN = {
  id: '77777777-0007-4000-9000-000000000007',
  title: 'Wooden Toy Kitchen Set',
  pricePerDay: 3_500,
  exactLatitude: 40.1776,
  exactLongitude: 44.5126,
} as const;

/**
 * M-011 stack guard — run before any real-stack journey.
 *
 * `ng serve` and the docker UI container fight over :4200, and a stale bundle
 * is indistinguishable from a fresh one by looking at the page. The docker UI
 * is served by nginx (Server: nginx response header); the Angular dev server
 * is not. The API must answer on :8080 (docker port; local `dotnet run` uses
 * 7241/5241, so a healthy :8080 means the docker API).
 */
export async function assertDockerStack(request: APIRequestContext): Promise<void> {
  const ui = await request.get(`${UI_URL}/`, { failOnStatusCode: false });
  const server = (ui.headers()['server'] ?? '').toLowerCase();
  if (!ui.ok() || !server.includes('nginx')) {
    throw new Error(
      `Real-stack guard: http://localhost:4200 is not the docker nginx UI ` +
        `(status ${ui.status()}, Server header: "${server || 'none'}" — an ng serve dev server?). ` +
        `Stop whatever owns :4200 and run: ` +
        `docker compose -f rental-api/docker-compose.yml up --build -d`,
    );
  }

  const api = await request.get(`${API_URL}/api/listings`, { failOnStatusCode: false });
  if (!api.ok()) {
    throw new Error(
      `Real-stack guard: docker API on :8080 is not healthy ` +
        `(GET /api/listings -> ${api.status()}). Is the docker stack up and seeded?`,
    );
  }
}

/** Logs in through the real API and returns the JWT. */
export async function apiLogin(request: APIRequestContext, account: Credentials): Promise<string> {
  const res = await request.post(`${API_URL}/api/auth/login`, { data: account });
  if (!res.ok()) {
    throw new Error(`API login failed for ${account.email}: ${res.status()} ${await res.text()}`);
  }
  // The wire contract allows both spellings (BackendAuthResponse in the UI);
  // the current API sends `accessToken`.
  const body = (await res.json()) as { token?: string; accessToken?: string };
  const token = body.accessToken ?? body.token;
  if (!token) throw new Error(`API login for ${account.email} returned no token.`);
  return token;
}

interface MineBooking {
  readonly id: string;
  readonly listingId: string;
  readonly status: string;
}

/**
 * Determinism self-heal: bookings persist in the dev DB between runs, and a
 * run that crashed mid-journey can leave renter@ with a non-terminal booking
 * (Pending/Approved/Active) on the target listing — which disables the
 * "Request to rent" CTA and can block date ranges. Drive any such leftover to
 * a terminal state through the real API before the journey starts:
 *   Pending/Approved -> renter cancels; Active -> owner completes;
 *   Approved past its start date (not cancellable) -> owner activates + completes.
 */
export async function releaseListingForRenter(
  request: APIRequestContext,
  listingId: string,
): Promise<void> {
  const renterToken = await apiLogin(request, ACCOUNTS.renter);
  const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

  const mineRes = await request.get(`${API_URL}/api/bookings/mine`, {
    headers: authHeaders(renterToken),
  });
  expect(mineRes.ok(), 'GET /api/bookings/mine must succeed during self-heal').toBe(true);
  const mine = (await mineRes.json()) as MineBooking[];

  const blocking = mine.filter(
    (b) => b.listingId === listingId && ['Pending', 'Approved', 'Active'].includes(b.status),
  );
  if (blocking.length === 0) return;

  const ownerToken = await apiLogin(request, ACCOUNTS.owner);
  for (const booking of blocking) {
    if (booking.status === 'Pending' || booking.status === 'Approved') {
      const cancel = await request.post(`${API_URL}/api/bookings/${booking.id}/cancel`, {
        headers: authHeaders(renterToken),
        failOnStatusCode: false,
      });
      if (cancel.ok() || booking.status === 'Pending') continue;
      // Approved booking already past its start date: complete it as the owner.
      await request.post(`${API_URL}/api/bookings/${booking.id}/activate`, {
        headers: authHeaders(ownerToken),
        failOnStatusCode: false,
      });
    }
    await request.post(`${API_URL}/api/bookings/${booking.id}/complete`, {
      headers: authHeaders(ownerToken),
      failOnStatusCode: false,
    });
  }
}

/**
 * Logs in through the real auth dialog (header "Log in" button). Mirrors the
 * mocked-tier flow in auth.spec.ts, but against the real API.
 */
export async function loginViaDialog(page: Page, account: Credentials): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).click();

  const form = page.locator('form.auth-form');
  await form.locator('input.uii-native').nth(0).fill(account.email);
  await form.locator('input.uii-native').nth(1).fill(account.password);
  await form.locator('button[type="submit"]').click();

  // The dialog closes once /auth/me hydrates the session — the real API round
  // trip (BCrypt verify + JWT) is why this timeout is explicit.
  await expect(form).toBeHidden({ timeout: 20_000 });
}
