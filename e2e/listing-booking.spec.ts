import { expect, test } from '@playwright/test';

import { mockApi } from './support/api-mock';
import { e2eCreateBookingResponse, e2eListingDetails, e2eUser } from './support/fixtures';

/**
 * Critical journey: a renter picks dates, writes a note to the owner, and
 * submits a booking request. The note field is new (`Booking.Note`,
 * backend-trimmed, max 280) and was previously wired to a TODO that silently
 * dropped it — see the request-body assertions below, which are the exact
 * thing that regression would break.
 */
test.describe('Booking — note field', () => {
  test.beforeEach(async ({ page }) => {
    // Seeded token so the (authGuard-protected) `:id/book` route admits us.
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'e2e-jwt-token');
    });
  });

  test('sends the trimmed note in the create-booking request body and echoes it on confirmation', async ({
    page,
  }) => {
    await mockApi(page, {
      me: e2eUser(),
      listingDetails: e2eListingDetails(),
      createBooking: { body: e2eCreateBookingResponse() },
    });

    await page.goto('/listings/listing-e2e-1/book');

    await page.getByRole('button', { name: '1 week', exact: true }).click();
    // Leading/trailing whitespace — the server trims before length-checking,
    // and the client mirrors that (see `onSubmit()` in
    // listing-booking-page.component.ts): the request body must carry the
    // trimmed text, not the raw textarea value.
    await page
      .getByLabel('Your message')
      .fill('  Please leave it by the gate around 6pm.  ');

    const [request] = await Promise.all([
      page.waitForRequest(
        (req) => req.url().endsWith('/api/bookings') && req.method() === 'POST',
      ),
      page.getByRole('button', { name: 'Send booking request' }).click(),
    ]);

    const body = request.postDataJSON() as {
      listingId: string;
      startDate: string;
      endDate: string;
      note: string | null;
    };
    expect(body.listingId).toBe('listing-e2e-1');
    expect(body.note).toBe('Please leave it by the gate around 6pm.');

    // Confirmation renders and echoes the (trimmed) note back.
    await expect(
      page.getByRole('heading', { name: 'Request sent to Olive!' }),
    ).toBeVisible();
    await expect(page.locator('.booking-page__confirm-note-bubble')).toContainText(
      'Please leave it by the gate around 6pm.',
    );

    // Bonus (same infrastructure, same page): "Message Olive" opens/creates the
    // booking's chat conversation and routes to it.
    const [chatRequest] = await Promise.all([
      page.waitForRequest(
        (req) =>
          req.url().includes('/api/chat/conversations/from-booking/') &&
          req.method() === 'POST',
      ),
      page.getByRole('button', { name: 'Message Olive' }).click(),
    ]);
    expect(chatRequest.url()).toContain('/api/chat/conversations/from-booking/booking-e2e-1');
    await page.waitForURL(/\/chat\/chat-e2e-1/);
  });

  test('sends null, not an empty string, for a whitespace-only note', async ({ page }) => {
    await mockApi(page, {
      me: e2eUser(),
      listingDetails: e2eListingDetails(),
      createBooking: { body: e2eCreateBookingResponse() },
    });

    await page.goto('/listings/listing-e2e-1/book');

    await page.getByRole('button', { name: '1 week', exact: true }).click();
    await page.getByLabel('Your message').fill('    ');

    const [request] = await Promise.all([
      page.waitForRequest(
        (req) => req.url().endsWith('/api/bookings') && req.method() === 'POST',
      ),
      page.getByRole('button', { name: 'Send booking request' }).click(),
    ]);

    const body = request.postDataJSON() as { note: string | null };
    expect(body.note).toBeNull();

    await expect(
      page.getByRole('heading', { name: 'Request sent to Olive!' }),
    ).toBeVisible();
    // No note was sent — the confirmation must not fabricate a note echo.
    await expect(page.locator('.booking-page__confirm-note')).toHaveCount(0);
  });

  test('shows a translated error for booking.note_too_long, not the raw backend title', async ({
    page,
  }) => {
    const rawBackendTitle = 'Note must be 280 characters or fewer.';
    await mockApi(page, {
      me: e2eUser(),
      listingDetails: e2eListingDetails(),
      createBooking: {
        status: 400,
        body: {
          type: 'urn:rental:error:booking.note_too_long',
          title: rawBackendTitle,
          status: 400,
          errorCode: 'booking.note_too_long',
        },
      },
    });

    await page.goto('/listings/listing-e2e-1/book');

    await page.getByRole('button', { name: '1 week', exact: true }).click();
    await page.getByLabel('Your message').fill('A short, perfectly valid note.');
    await page.getByRole('button', { name: 'Send booking request' }).click();

    const error = page.locator('.booking-page__error');
    await expect(error).toContainText('Your note is too long');
    await expect(error).not.toContainText(rawBackendTitle);
  });
});

/**
 * Regression coverage for the fixed `bookedDates`/`bookedDateRanges` field-name
 * bug (see the feature note this ships alongside): the calendar used to
 * disable nothing because the page read a field the API never sent. Unit
 * coverage already pins the two halves in isolation —
 * `listings-api.service.spec.ts` (raw wire payload -> normalized
 * `bookedDateRanges`) and `booking-calendar.component.spec.ts`
 * (`expandBookedDateRangesToDisabledDates` + direct component inputs) — but
 * nothing before this exercised the actual wiring: a real mocked HTTP
 * response, flowing through the real NgRx store and the real
 * `[bookedDates]="item.bookedDateRanges"` template binding, into a real
 * PrimeNG calendar a user can click on. That glue is exactly where the bug
 * lived, so this stays a real-DOM interaction test, not a duplicate of either
 * unit spec.
 */
test.describe('Booking calendar — booked dates stay disabled (regression)', () => {
  test('a day inside a booked range renders disabled and cannot be selected', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'e2e-jwt-token');
    });

    // Always the 1st of next month: guaranteed in the future (clears the
    // calendar's `minDate: today`) and guaranteed to fall inside the month
    // reached by a single "next month" click, regardless of what day of the
    // month the suite happens to run on.
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const isoDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
    // PrimeNG's own day-cell key format (`formatDateKey`): `{year}-{0-based month}-{day}`.
    const dayCellKey = `${nextMonth.getFullYear()}-${nextMonth.getMonth()}-1`;

    await mockApi(page, {
      me: e2eUser(),
      listingDetails: e2eListingDetails({
        bookedDateRanges: [{ startDate: isoDate, endDate: isoDate }],
      }),
    });

    await page.goto('/listings/listing-e2e-1/book');

    await page.locator('.p-datepicker-next-button').click();

    const bookedDay = page.locator(`span[data-date="${dayCellKey}"]`);
    await expect(bookedDay).toHaveClass(/p-disabled/);

    // A disabled cell is, correctly, never Playwright-actionable (it sits
    // under the page's sticky-header hit box and PrimeNG's own non-
    // interactive `td` wrapper) — waiting for a real click to land would only
    // time out. Dispatch the click event directly on the span instead: that
    // still exercises the exact guard this regression is about (PrimeNG's
    // `onDateSelect()` reads `date.selectable` and no-ops), without asserting
    // anything about pointer hit-testing, which isn't what's under test here.
    await bookedDay.dispatchEvent('click');
    await expect(page.locator('.booking-page__breakdown-row--hint')).toBeVisible();
  });
});
