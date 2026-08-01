# E2E tests (Playwright) — two tiers

Two Playwright projects live in one `playwright.config.ts`. They answer different
questions and neither replaces the other.

| | `chromium` — mocked tier | `real` — real-stack tier |
|---|---|---|
| Command | `npm run e2e` | `npm run e2e:real` |
| App under test | real Angular app via `ng serve` (`webServer`) | docker UI (nginx) on :4200 |
| Backend | **stubbed at the network layer** by `support/api-mock.ts` | REAL ASP.NET Core API on :8080 + REAL SQL Server (docker) |
| Data | inline wire-shape seeds (`support/fixtures.ts`) | idempotent dev seed (demo accounts, fixed listing GUIDs) |
| Proves | UI wiring: routing, guards, NgRx flows, optimistic updates, rendering of a declared state | the whole system: real auth (BCrypt/JWT), authorization, status machines, SQL persistence, API↔UI contract in production-shaped containers |
| Cannot prove | anything about the real backend — the mock answers every `/api/**` request, so a broken server, contract drift, or a dead endpoint stays green (M-013) | nothing about uncommitted UI source — it tests the *built docker image*, not your working tree |
| Speed / when | seconds; every change | minutes incl. stack build; before merge and when touching booking/auth/roles |

Unit tiers below these: `npm test` (28 vitest specs, UI logic) and
`dotnet test rental-api/RentalPlatform.sln` (xUnit; note its "integration" tests
swap SQL Server for SQLite via `EnsureCreated` — see
`rental-api/src/RentalPlatform.Api/Extensions/MigrationExtensions.cs` — so they
do not exercise real SQL Server behaviour either). The real-stack tier is the
only automated layer where no boundary is faked.

## Running

```bash
# one-time
npx playwright install chromium

# mocked tier (starts ng serve itself; no API/DB needed)
npm run e2e
npm run e2e:ui          # interactive

# real-stack tier — bring the docker stack up FIRST, freshly built:
docker compose -f rental-api/docker-compose.yml up --build -d   # from the repo root
npm run e2e:real
```

### Who owns :4200 (M-011 — read before blaming a test)

`ng serve` and the docker UI container fight over port 4200, and a stale docker
bundle is indistinguishable from a fresh one by eye. Rules:

- **Real tier:** every real spec first runs `assertDockerStack()`
  (`support/real-stack.ts`): :4200 must answer with a `Server: nginx` header
  (docker UI) and :8080 must be the healthy docker API — otherwise the run
  hard-fails with instructions. Always start the stack with `--build` so the
  image contains the commit you think you are testing.
- **Mocked tier:** `webServer` reuses *anything* already listening on :4200 —
  including a docker container. If the docker stack is up, stop its `ui`
  service (or the stack) before `npm run e2e`, or you will silently test a
  stale bundle. This is now also enforced automatically: `globalSetup`
  (`support/global-setup.ts`) checks :4200 for the docker `Server: nginx`
  header before any mocked test runs and hard-fails with the same
  instructions if found — one check protects every mocked spec, including
  ones not yet written, instead of relying on remembering this paragraph.

## Coverage map — critical journeys (2026-07-24)

Layers: **U** = unit (vitest / xUnit), **M** = mocked Playwright, **R** = real-stack Playwright.

| Journey | Covered today | Gap |
|---|---|---|
| Auth (login, session hydrate, blocked user) | U: auth store/guard specs, xUnit auth tests · M: `auth.spec.ts` happy + rejected · R: real BCrypt/JWT login exercised as part of the booking journey | no dedicated R spec for register / blocked@ rejection / expiry |
| Listing discovery (browse, filter, details) | U: store/selector specs, `listings-api.service.spec.ts` (param serialization) · M: `listings.smoke.spec.ts` render + favorite toggle · **R: `real/listings-search-filter.spec.ts`** — proves `?search=` actually narrows the real backend result set (regression for the search contract-drift bug, sibling of M-020) | age-group and distance filters have backend xUnit coverage (`ListingsQueryServiceFilterTests.cs`) and frontend param-serialization unit coverage, but no R spec — distance depends on `navigator.geolocation` (flaky in CI); pagination not e2e-covered at any layer |
| Listing location (pin picker, approximate-map tap-to-load, districts) | U: `ListingDetailCoordinatePrivacyTests`/`ListingDetailAddressRevealTests` (xUnit, privacy gate) · M: `create-listing-location.spec.ts` (Step 3 pin → request body), `listing-location.spec.ts` (district/city text, tap-to-load map, no-coordinates fallback) | R: no real-stack coverage yet (real geohash fuzzing / district derivation only unit-tested); district-select override in the wizard not e2e-covered |
| Map view (catalog, Maps P2-2: List/Map toggle, pin clustering, popups) | U: `listings-map.component.spec.ts` (real `app-map` + mocked Leaflet — grouping, 400ms viewport debounce, fitPins discipline, 150ms popup grace, truncated banner), xUnit `ListingMapPinsQueryServiceTests` + HTTP `ListingMapPinsHttpTests` (query-string binding, 400 on `minLng>maxLng`, wire shape) · **M: `listings-map.spec.ts`** — real Leaflet: toggle/URL/reload, N-coordinates-to-N-balls incl. the same-coordinate collapse (1 ball, 2 stacked popups), real-DOM hover popup + its `/listings/:id` link, the 150ms close-grace reachability, filter query-params re-attached on refetch | no real-stack (R) coverage of the map UI itself (privacy property is R-covered API-side, see `real/map-pins-privacy.spec.ts`); per-group uncertainty circles have no app-owned CSS hook so their render isn't asserted at any browser layer — see that spec's own doc comment |
| Booking request + lifecycle (Pending→Approved→Active→Completed) | U: xUnit `BookingsService` transition tests (SQLite) · **R: `real/booking-lifecycle.spec.ts` — full journey, both parties** | Rejected / Cancelled / Expired paths not e2e-covered (unit-only) |
| Role boundaries renter/owner/admin | U: xUnit authorization tests · M: adminGuard admits seeded admin · R: owner-only handover/complete CTAs asserted for both roles | no R coverage for admin vs API (e.g. non-admin hitting /admin), blocked-user writes |
| Reviews | U: eligibility spec (`booking-details-page.eligibility.spec.ts`), xUnit review rules · R: "Leave a review" offered after real completion | submitting a review not e2e-covered at any layer |
| Uploads (listing images, chat attachments) | U: xUnit storage tests | **nothing automated exercises real multipart upload → disk → serve (M-013 root cause); highest-value next R spec** |
| Chat negotiate / messaging (SignalR) | U: chat store/component specs · xUnit ChatService | no e2e at all; realtime WS through nginx broke before (M-008) and only manual checks would catch it |
| Moderation (approve/reject listing) | U: xUnit admin tests · M: `admin-moderation.spec.ts` queue clears | R: none (seeded PendingApproval listings exist — cheap to add) |
| Language switching + user-facing validation errors | U: some pipe/component specs · M: error-detail rendering on failed login | no e2e for hy/ru switch persistence or localized validation texts |
| Client/server contract conformance (every `ApiContract` path resolves to a real backend route) | **R: `real/api-contract-conformance.spec.ts`** — diffs `ApiContract` against the live API's OpenAPI route table | verb (GET/POST) not checked, only path existence; auth/authorization on the route not checked |
| Profile page (view own profile: phone, language, avatar) | U: `profile-api.service.spec.ts` pins the endpoint URL and role mapping | no e2e at any layer for the rendered page itself — see `api-contract-conformance.spec.ts` docblock for why route-existence (not a browser journey) was the fix chosen for the dorent.am `/api/profile/me` incident |

Keep the mocked tier **thin** — catastrophic-if-broken journeys only. New
regression coverage grows in the real tier or below (unit/integration), never as
mocked-tier sprawl.

## Real-tier determinism (persistent dev DB)

Bookings created by tests **persist between runs**. `real/booking-lifecycle.spec.ts`
stays re-runnable because:

1. **Seed invariants only** — fixed listing GUID (`Wooden Toy Kitchen Set`,
   owned by `owner@rental.local`), demo accounts, seeded owner phone. No
   volatile data.
2. **Collision-free windows** — the rental window starts two months out on a
   day derived from the run timestamp; and every booking the spec creates is
   driven to `Completed`, which is terminal and never blocks future ranges
   (only Pending/Approved bookings block).
3. **Self-heal, not manual cleanup** — a crashed run can strand a
   Pending/Approved/Active booking, which disables the listing's book CTA for
   the renter. `releaseListingForRenter()` drives leftovers to a terminal state
   through the real API before the journey starts.

If a journey ever needs data the seed cannot guarantee, extend the dev seed
(spec it for backend-dev) — do not build workarounds on volatile state.

## Flaky policy

- A flaky test is a **bug of the suite** — investigate it; do not tolerate,
  re-run, or quietly weaken it. A pass obtained by re-running is not a pass,
  and the original failure stays in whatever report you write.
- **Retries:** real tier `retries: 0` everywhere — its failures must surface,
  not be averaged away. Mocked tier keeps `retries: 1` on CI only, solely so a
  transient `ng serve` boot hiccup does not block CI; locally it is 0. Any new
  retry needs a written justification in the config.
- **Artifacts on failure only:** real tier uses `trace: 'retain-on-failure'` +
  `screenshot: 'only-on-failure'`; mocked tier `trace: 'on-first-retry'`. No
  video, no artifacts on green runs.
- **No `skip`/`fixme`/arbitrary waits** without a stated reason in the code and
  the commit message. Explicit long timeouts exist only where a real slow
  operation is named (e.g. BCrypt login round-trip, docker cold start).

## Conventions

- Selectors: roles and accessible names first, stable CSS hooks
  (`.listing-card__title`, `app-booking-status-badge`) second, `data-testid`
  where labels are translated.
- Default UI language is `en` when localStorage is empty — English label
  assertions are stable.
- Mocked seeds go through `support/fixtures.ts`; real-tier helpers through
  `support/real-stack.ts`. Real specs live in `e2e/real/` and never import
  `api-mock.ts`.
- Real tests run against the local docker stack ONLY — never against
  https://dorent.am or any production host.
