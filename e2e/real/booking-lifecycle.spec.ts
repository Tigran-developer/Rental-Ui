import { expect, test, type Page } from '@playwright/test';

import {
  ACCOUNTS,
  TOY_KITCHEN,
  assertDockerStack,
  loginViaDialog,
  releaseListingForRenter,
} from '../support/real-stack';

/**
 * Real-stack booking lifecycle — the signature journey of the real tier.
 *
 * Renter authenticates -> books the seeded "Wooden Toy Kitchen Set" (owned by
 * owner@rental.local) -> owner sees the request and approves -> owner hands
 * the toy over (Approved -> Active, owner-only) -> owner completes the rental
 * (Active -> Completed, owner-only) -> renter is offered a review.
 *
 * The whole lifecycle is ONE test: the steps share a live booking, and hard
 * rule 7 (no order-dependent tests) forbids splitting shared mutable state
 * across test() boundaries.
 *
 * Determinism (persistent dev DB, re-runnable):
 * - Seed invariants only: fixed listing GUID, demo accounts, owner phone.
 * - The date window starts two calendar months out with a start day derived
 *   from the run timestamp (3..24), so windows from repeated runs rarely
 *   collide — and even a collision is harmless because every booking this
 *   spec creates ends Completed (terminal, never blocks future ranges).
 * - Crashed runs are self-healed up front: releaseListingForRenter() drives
 *   any leftover non-terminal renter@ booking on the listing to a terminal
 *   state through the real API, which re-enables the "Request to rent" CTA.
 */

/** Owner phone from the dev seed — proves the contact-reveal rule (Approved+). */
const OWNER_PHONE = '+374 99 100 002';

const MONTHS_AHEAD = 2;

/**
 * Matches how DramCurrencyPipe renders `amount` — the grouped whole number
 * (Intl 'en-US', same grouping Angular's formatNumber uses) followed by the ֏
 * symbol. Whitespace between the number and the symbol is tolerated as an
 * ordinary space, NBSP, or narrow NBSP (the pipe currently emits a plain
 * space, but locale-driven number formatting elsewhere in the app can
 * substitute either NBSP variant), while the digits/grouping must match
 * exactly — this must never pass on the wrong amount.
 */
function expectedTotalPattern(amount: number): RegExp {
  const grouped = amount.toLocaleString('en-US'); // e.g. "14,000" — no regex metacharacters
  return new RegExp(`^${grouped}[ \\u00A0\\u202F]?֏$`);
}

interface BookingWindow {
  readonly startDay: number;
  readonly endDay: number;
  readonly monthName: string;
  readonly monthShort: string;
  readonly year: string;
}

function bookingWindow(): BookingWindow {
  const startDay = 3 + (Math.floor(Date.now() / 60_000) % 22); // 3..24
  const target = new Date();
  target.setDate(1);
  target.setMonth(target.getMonth() + MONTHS_AHEAD);
  return {
    startDay,
    endDay: startDay + 3, // 4 inclusive days
    monthName: target.toLocaleString('en-US', { month: 'long' }),
    monthShort: target.toLocaleString('en-US', { month: 'short' }),
    year: String(target.getFullYear()),
  };
}

/**
 * Clicks a day number in the inline PrimeNG datepicker (current month cells
 * only). The click timeout is bounded: if a calendar re-bind swapped the view
 * under us, the locator can re-resolve to a disabled (past) cell — an unbounded
 * click would then wait forever and starve the toPass retry in selectRange.
 */
async function pickCalendarDay(page: Page, day: number): Promise<void> {
  await page
    .locator('td.p-datepicker-day-cell:not(.p-datepicker-other-month)')
    .filter({ hasText: new RegExp(`^${day}$`) })
    .locator('span.p-datepicker-day')
    .click({ timeout: 5_000 });
}

/** Advances the datepicker until it shows the target month (bounded). */
async function goToTargetMonth(page: Page, window: BookingWindow): Promise<void> {
  const monthBtn = page.locator('button.p-datepicker-select-month');
  const yearBtn = page.locator('button.p-datepicker-select-year');
  for (let i = 0; i < 2 * MONTHS_AHEAD; i++) {
    const month = ((await monthBtn.textContent()) ?? '').trim();
    const year = ((await yearBtn.textContent()) ?? '').trim();
    if (month === window.monthName && year === window.year) break;
    await page.locator('button.p-datepicker-next-button').click();
  }
  await expect(monthBtn).toHaveText(window.monthName);
  await expect(yearBtn).toHaveText(window.year);
}

/**
 * Selects the rental range and PINS the fix for the calendar snap-back bug
 * (Rental-Ui commit e32b681). Pre-fix behaviour, reproduced against the real
 * stack: selecting a day in a FUTURE month made the calendar view snap back to
 * the current month within ~400ms — `normalizeRangeSelection()` copied the
 * selection array, NgModel saw a new reference and scheduled a deferred
 * writeValue() carrying the partial [start, null] range, and PrimeNG's
 * updateUI() fell back to `new Date()` for the view month. The stay-on-month
 * assertion below is the e2e regression pin: it reads the month label AFTER
 * the ~400ms snap window and requires the target month — exactly the condition
 * observed failing on the pre-fix bundle (probe read "July" 400ms after
 * clicking a September day; four full runs failed on it). frontend-dev's
 * component-level vitest harness additionally proved both directions (3 specs,
 * failing pre-fix). The surrounding toPass stays for unrelated init-time
 * re-bind races only — a snap-back now fails every attempt, and therefore the
 * test.
 */
async function selectRange(
  page: Page,
  window: BookingWindow,
  expectedTotal: RegExp,
): Promise<void> {
  const pickupBox = page.locator('.booking-calendar__date-value').first();
  const returnBox = page.locator('.booking-calendar__date-value').nth(1);
  const startText = `${window.startDay} ${window.monthShort} ${window.year}`;
  const endText = `${window.endDay} ${window.monthShort} ${window.year}`;
  const clearChip = page.locator('.booking-page__quick-chip', { hasText: '1 day' });

  // Each attempt is fully self-contained: clear -> navigate -> start -> end,
  // with the on-screen app state (pickup/return boxes, month label, price
  // total) verified after every move.
  await expect(async () => {
    // Deterministic clear via the quick-book toggle (selecting then unselecting
    // a chip resets the whole range through app logic). The chip's class
    // binding repaints asynchronously (Angular change detection after the
    // click event, not synchronously with it) — reading
    // `clearChip.getAttribute('class')` immediately after `.click()` races
    // that flush and was observed (diagnostic script, 2026-07-23) to read the
    // STALE pre-click class roughly at random, which made this helper
    // mis-judge whether a second click was needed and could leave the chip
    // toggled the wrong way, poisoning every later toPass() retry (the box
    // then never clears within the loop). Read the pickup box's own text
    // instead: capture it before clicking, then wait for Playwright's
    // auto-retrying assertion to confirm it actually changed (no fixed
    // sleep) before deciding whether a second click is required — this is
    // correct regardless of which state the chip/box started in.
    const beforeClear = (await pickupBox.textContent()) ?? '';
    await clearChip.click();
    await expect(pickupBox).not.toHaveText(beforeClear, { timeout: 2_000 });
    if (((await pickupBox.textContent()) ?? '').trim() !== '—') {
      await clearChip.click();
    }
    await expect(pickupBox).toHaveText('—', { timeout: 2_000 });

    // Range start in the target month.
    await goToTargetMonth(page, window);
    await pickCalendarDay(page, window.startDay);
    await expect(pickupBox).toContainText(startText, { timeout: 2_000 });
    await expect(returnBox).toHaveText('—');

    // REGRESSION PIN (e32b681): wait PAST the historical ~400ms snap window,
    // then require the visible month to STILL be the target month. Pre-fix
    // this read the current month here; no re-navigation is allowed to mask it.
    await page.waitForTimeout(750);
    await expect(page.locator('button.p-datepicker-select-month')).toHaveText(window.monthName);
    await expect(page.locator('button.p-datepicker-select-year')).toHaveText(window.year);

    // Range end, clicked directly in the (still-visible) target month.
    await pickCalendarDay(page, window.endDay);
    await expect(returnBox).toContainText(endText, { timeout: 2_000 });
    await expect(page.locator('.booking-page__breakdown-row--total dd')).toHaveText(
      expectedTotal,
      { timeout: 2_000 },
    );
  }).toPass({ timeout: 90_000 });
}

function statusBadge(page: Page) {
  return page.locator('app-booking-status-badge');
}

test.describe('Booking lifecycle (real stack)', () => {
  test('renter books, owner approves, hands over and completes', async ({
    page: renterPage,
    browser,
    request,
  }) => {
    await test.step('guard: docker stack is what is actually serving :4200/:8080', async () => {
      await assertDockerStack(request);
    });

    await test.step('self-heal: release leftover bookings from crashed runs', async () => {
      await releaseListingForRenter(request, TOY_KITCHEN.id);
    });

    await test.step('renter signs in and opens the seeded listing', async () => {
      await loginViaDialog(renterPage, ACCOUNTS.renter);
      await renterPage.goto(`/listings/${TOY_KITCHEN.id}`);
      await expect(renterPage.locator('h1.detail-page__title')).toHaveText(TOY_KITCHEN.title);
    });

    const window = bookingWindow();
    let bookingId = '';

    await test.step('renter picks a future window and sends the booking request', async () => {
      // The /book page re-fetches the listing on init; interacting with the
      // calendar before that response lands gets undone by the re-bind reset —
      // so synchronize on the fresh response first (see selectRange docs).
      const freshListingLoad = renterPage.waitForResponse(
        (res) =>
          res.url().endsWith(`/api/listings/${TOY_KITCHEN.id}`) &&
          res.request().method() === 'GET' &&
          res.ok(),
      );
      await renterPage
        .getByRole('button', { name: 'Request to rent' })
        .filter({ visible: true })
        .first()
        .click();
      await renterPage.waitForURL(`**/listings/${TOY_KITCHEN.id}/book`);
      await freshListingLoad;
      await expect(renterPage.locator('.booking-page__request-item-title')).toHaveText(
        TOY_KITCHEN.title,
      );

      // 4 inclusive days x 3,500 AMD/day = 14,000 AMD. Rendered by
      // DramCurrencyPipe (dram-currency.pipe.ts) as Angular's
      // formatNumber(total, 'en-US', '1.0-0') + ' ֏' — e.g. "14,000 ֏". Build
      // the expected grouping the same way (Intl, en-US) rather than
      // hardcoding a string, and tolerate the ordinary space, a non-breaking
      // space, or a narrow no-break space between amount and symbol without
      // loosening what amount is required — selectRange only returns once the
      // breakdown shows it.
      await selectRange(renterPage, window, expectedTotalPattern(TOY_KITCHEN.pricePerDay * 4));

      await renterPage
        .locator('.booking-page__request-card')
        .getByRole('button', { name: 'Send booking request' })
        .click();
      await expect(renterPage.getByText('Booking request sent!')).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('renter sees the booking as Pending approval', async () => {
      await renterPage.getByRole('button', { name: 'View booking' }).click();
      await renterPage.waitForURL(/\/bookings\/[0-9a-fA-F-]{36}$/);
      bookingId = renterPage.url().split('/').pop()!;

      await expect(statusBadge(renterPage)).toHaveText('Pending approval');
      // Renter may cancel a pending request…
      await expect(renterPage.getByRole('button', { name: 'Cancel request' })).toBeVisible();
      // …but never sees the owner-only lifecycle actions (role boundary).
      await expect(renterPage.getByRole('button', { name: 'Mark as handed over' })).toHaveCount(0);
      // Contact details stay hidden until the owner approves.
      await expect(renterPage.getByText(OWNER_PHONE)).toHaveCount(0);
    });

    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();

    try {
      await test.step('owner sees the request and approves it', async () => {
        await loginViaDialog(ownerPage, ACCOUNTS.owner);
        await ownerPage.goto('/bookings/requests');

        const requestCard = ownerPage
          .locator('app-booking-request-card')
          .filter({ hasText: TOY_KITCHEN.title });
        await expect(requestCard).toHaveCount(1);
        await requestCard.getByRole('button', { name: 'Approve' }).click();
        // On success the card leaves the Pending tab.
        await expect(requestCard).toHaveCount(0);
      });

      await test.step('renter sees Approved and the now-revealed owner contact', async () => {
        await renterPage.reload();
        await expect(statusBadge(renterPage)).toHaveText('Approved');
        await expect(renterPage.getByText(OWNER_PHONE)).toBeVisible();
        // Approved-but-not-started bookings are still cancellable by the renter.
        await expect(renterPage.getByRole('button', { name: 'Cancel request' })).toBeVisible();
      });

      await test.step('owner hands the toy over: Approved -> Active', async () => {
        await ownerPage.goto(`/bookings/${bookingId}`);
        await expect(statusBadge(ownerPage)).toHaveText('Approved');

        await ownerPage.getByRole('button', { name: 'Mark as handed over' }).click();
        await expect(statusBadge(ownerPage)).toHaveText('Active');
      });

      await test.step('renter sees Active and has no lifecycle actions', async () => {
        await renterPage.reload();
        await expect(statusBadge(renterPage)).toHaveText('Active');
        await expect(renterPage.getByRole('button', { name: 'Mark as completed' })).toHaveCount(0);
        // Active bookings are no longer cancellable by the renter.
        await expect(renterPage.getByRole('button', { name: 'Cancel request' })).toHaveCount(0);
      });

      await test.step('owner completes the rental: Active -> Completed', async () => {
        await ownerPage.getByRole('button', { name: 'Mark as completed' }).click();
        await expect(statusBadge(ownerPage)).toHaveText('Completed');
      });

      await test.step('renter sees Completed and is offered a review', async () => {
        await renterPage.reload();
        await expect(statusBadge(renterPage)).toHaveText('Completed');
        await expect(renterPage.getByRole('button', { name: 'Leave a review' })).toBeVisible();
      });

      await test.step('listing is bookable again — the run leaves no blocking state', async () => {
        await renterPage.goto(`/listings/${TOY_KITCHEN.id}`);
        await expect(
          renterPage
            .getByRole('button', { name: 'Request to rent' })
            .filter({ visible: true })
            .first(),
        ).toBeEnabled();
      });
    } finally {
      await ownerContext.close();
    }
  });
});
