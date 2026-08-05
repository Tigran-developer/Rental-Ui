import { expect, test } from '@playwright/test';

import { mockApi } from './support/api-mock';
import {
  e2eCreateBookingResponse,
  e2eListingDetails,
  e2eMyBooking,
  e2eUser,
} from './support/fixtures';

/**
 * Contact-privacy regression: an earlier design proposed revealing the
 * owner's phone number as soon as a renter sent a booking request. That was
 * explicitly rejected in favour of keeping the server's Approved/Active/
 * Completed reveal gate — copy on both the details page and the booking page
 * was written to match ("Contact details become available once the booking
 * is approved" / "{{name}}'s contact details unlock once they approve your
 * booking"). This test holds that line: even when the owner's real phone
 * number is present in the payload (proving the client *has* the value), it
 * must never be rendered while the booking is Pending — on the details page
 * (both before any booking exists and with an existing Pending booking on
 * file), on the booking page, or on the just-submitted confirmation.
 */
test.describe('Contact privacy — Pending booking never reveals the phone number', () => {
  const OWNER_PHONE = '+374 55 000111';

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'e2e-jwt-token');
    });
  });

  test('phone number is absent on details (pre-booking + existing Pending), booking, and confirmation', async ({
    page,
  }) => {
    const listingDetails = e2eListingDetails({
      owner: {
        id: 'owner-e2e-1',
        firstName: 'Olive',
        lastName: 'Owner',
        phoneNumber: OWNER_PHONE,
      },
    });

    await mockApi(page, {
      me: e2eUser(),
      listingDetails,
      createBooking: { body: e2eCreateBookingResponse({ status: 'Pending' }) },
    });

    // 1. Details page, no booking on file yet.
    await page.goto('/listings/listing-e2e-1');
    await expect(page.locator('body')).not.toContainText(OWNER_PHONE);

    // 2. Booking page, before submitting.
    await page.goto('/listings/listing-e2e-1/book');
    await expect(page.locator('body')).not.toContainText(OWNER_PHONE);

    // 3. Confirmation, immediately after submitting (server returns Pending).
    await page.getByRole('button', { name: '1 week', exact: true }).click();
    await page.getByRole('button', { name: 'Send booking request' }).click();
    await expect(
      page.getByRole('heading', { name: 'Request sent to Olive!' }),
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText(OWNER_PHONE);
  });

  test('phone number is absent on details when an existing booking-relationship banner is Pending', async ({
    page,
  }) => {
    const listingDetails = e2eListingDetails({
      owner: {
        id: 'owner-e2e-1',
        firstName: 'Olive',
        lastName: 'Owner',
        phoneNumber: OWNER_PHONE,
      },
    });

    await mockApi(page, {
      me: e2eUser(),
      listingDetails,
      myBookings: [e2eMyBooking({ status: 'Pending' })],
    });

    await page.goto('/listings/listing-e2e-1');

    // Proves the *relationship banner* branch (a different template path from
    // the plain owner card above) also withholds the phone number.
    await expect(page.locator('.detail-page__relationship')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(OWNER_PHONE);
  });
});
