import { expect, test } from '@playwright/test';

import { mockApi } from './support/api-mock';
import { e2eListingDetails, e2eUser } from './support/fixtures';

/**
 * Report submission from the listing details page (`ReportDialogComponent`, wired in via
 * `canReportListing()` in `listing-details-page.component.ts`). Backend stubbed at the network
 * layer via `support/api-mock.ts`'s `submitReport` seed.
 *
 * `report.already_reported` (409) is the one outcome worth pinning here: filing a duplicate
 * report on the same target is an expected, normal thing for a renter to attempt — the dialog
 * must render it as a calm, reassuring state, never as a red error panel (see
 * `report-dialog.component.ts`'s class doc comment).
 */
test.describe('Report submission', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'e2e-jwt-token');
    });
  });

  test('submitting a duplicate report renders the calm "already reported" state, not an error', async ({
    page,
  }) => {
    await mockApi(page, {
      me: e2eUser(), // 'user-e2e-1' — distinct from the listing's owner, so the affordance shows.
      listingDetails: e2eListingDetails(),
      submitReport: {
        status: 409,
        body: {
          type: 'urn:rental:error:report.already_reported',
          title: 'You have already reported this.',
          status: 409,
          errorCode: 'report.already_reported',
        },
      },
    });

    await page.goto('/listings/listing-e2e-1');

    await page.getByRole('button', { name: 'Report' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.getByRole('radio', { name: /Spam or scam/ }).click();
    await dialog.getByRole('button', { name: 'Submit report' }).click();

    await expect(dialog.locator('.report-dialog__outcome-title')).toHaveText('Already reported');
    await expect(dialog.locator('.report-dialog__outcome--info')).toBeVisible();
    await expect(dialog.locator('.report-dialog__outcome--error')).toHaveCount(0);
  });
});
