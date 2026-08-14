import { expect, test } from '@playwright/test';

import { mockApi } from './support/api-mock';
import { e2eAdmin, e2eAdminListing } from './support/fixtures';

/**
 * Critical journey: an admin clears the moderation queue via the redesigned
 * `/admin/review` console (`ReviewPageComponent` + `ReviewCardComponent`,
 * with `RejectPanelComponent` inline on desktop and `RejectSheetComponent`
 * as a bottom sheet on mobile). A seeded token lets the boot-time /auth/me
 * call hydrate the admin role so adminGuard admits the route.
 *
 * Backend stays stubbed at the network layer — see `support/api-mock.ts`'s
 * `adminListings` seed, which keeps an in-memory working copy of the queue
 * so the page's post-decision refetch (`AdminModerationEffects
 * .refetchAfterDecision$`) sees the mutation, not the original seed.
 *
 * Default project viewport (`devices['Desktop Chrome']`, 1280×720) is the
 * desktop/inline-panel layout; tests that need the mobile/bottom-sheet
 * layout resize explicitly via `page.setViewportSize`.
 */
test.describe('Admin moderation', () => {
  test.beforeEach(async ({ page }) => {
    // Seed a token before the app boots so initAuth$ hydrates the session.
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'e2e-jwt-token');
    });
  });

  test('approves a pending listing, removes it from the queue, and updates tab counts', async ({
    page,
  }) => {
    await mockApi(page, {
      me: e2eAdmin(),
      adminListings: [e2eAdminListing({ id: 'listing-approve-1', title: 'E2E Toy Kitchen' })],
    });

    await page.goto('/admin/review');

    await expect(page.getByText('E2E Toy Kitchen')).toBeVisible();
    const pendingTab = page.getByRole('tab', { name: /Pending/ });
    const approvedTab = page.getByRole('tab', { name: /Approved/ });
    await expect(pendingTab.locator('.admin-tabs__count')).toHaveText('1');
    await expect(approvedTab.locator('.admin-tabs__count')).toHaveText('0');

    await page.locator('.review-card__btn--approve').click();

    // Optimistic removal happens immediately; the post-decision refetch then
    // confirms it against the (now-mutated) backend queue and counts.
    await expect(page.getByText('E2E Toy Kitchen')).toHaveCount(0);
    await expect(pendingTab.locator('.admin-tabs__count')).toHaveText('0');
    await expect(approvedTab.locator('.admin-tabs__count')).toHaveText('1');
  });

  test('rejecting is blocked until a reason is chosen, then removes the listing (desktop inline panel)', async ({
    page,
  }) => {
    await mockApi(page, {
      me: e2eAdmin(),
      adminListings: [e2eAdminListing({ id: 'listing-reject-1', title: 'E2E Wobbly Blocks' })],
    });

    await page.goto('/admin/review');
    await expect(page.getByText('E2E Wobbly Blocks')).toBeVisible();

    await page.locator('.review-card__btn--reject').click();
    const confirmBtn = page.locator('.reject-panel__btn--confirm');

    // The single most important assertion in this suite: an admin must not
    // be able to reject without picking a reason (that reason is what the
    // owner sees and acts on).
    await expect(confirmBtn).toBeDisabled();

    await page.getByRole('radio', { name: /Poor images/ }).click();
    await expect(confirmBtn).toBeEnabled();

    await page.locator('.reject-panel__note').fill('Photos are too dark, please retake in daylight.');
    await confirmBtn.click();

    await expect(page.getByText('E2E Wobbly Blocks')).toHaveCount(0);
  });

  test('rejecting is blocked until a reason is chosen, then removes the listing (mobile bottom sheet)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, {
      me: e2eAdmin(),
      adminListings: [e2eAdminListing({ id: 'listing-reject-2', title: 'E2E Wobbly Blocks' })],
    });

    await page.goto('/admin/review');
    await expect(page.getByText('E2E Wobbly Blocks')).toBeVisible();

    await page.locator('.review-card__btn--reject').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const confirmBtn = page.locator('.reject-sheet__btn--confirm');

    // Same non-negotiable guard as the desktop panel, exercised through the
    // mobile sheet's own markup/state instead of assuming the desktop
    // coverage proves it.
    await expect(confirmBtn).toBeDisabled();

    await page.getByRole('radio', { name: /Poor images/ }).click();
    await expect(confirmBtn).toBeEnabled();

    await page.locator('.reject-sheet__textarea').fill('Photos are too dark, please retake in daylight.');
    await confirmBtn.click();

    await expect(page.getByText('E2E Wobbly Blocks')).toHaveCount(0);
  });

  test('tabs request and render Pending / Approved / Rejected independently', async ({ page }) => {
    await mockApi(page, {
      me: e2eAdmin(),
      adminListings: [
        e2eAdminListing({ id: 'listing-p', title: 'Pending Toy Train', status: 'PendingApproval' }),
        e2eAdminListing({ id: 'listing-a', title: 'Approved Toy Blocks', status: 'Approved' }),
        e2eAdminListing({ id: 'listing-r', title: 'Rejected Toy Drum', status: 'Rejected' }),
      ],
    });

    await page.goto('/admin/review');

    // Pending is the default tab.
    await expect(page.getByText('Pending Toy Train')).toBeVisible();
    await expect(page.getByText('Approved Toy Blocks')).toHaveCount(0);
    await expect(page.getByText('Rejected Toy Drum')).toHaveCount(0);

    await page.getByRole('tab', { name: /Approved/ }).click();
    await expect(page.getByText('Approved Toy Blocks')).toBeVisible();
    await expect(page.getByText('Pending Toy Train')).toHaveCount(0);
    await expect(page.getByText('Rejected Toy Drum')).toHaveCount(0);

    await page.getByRole('tab', { name: /Rejected/ }).click();
    await expect(page.getByText('Rejected Toy Drum')).toBeVisible();
    await expect(page.getByText('Pending Toy Train')).toHaveCount(0);
    await expect(page.getByText('Approved Toy Blocks')).toHaveCount(0);
  });

  test('inspect dossier renders the owner trust panel and compliance checklist', async ({ page }) => {
    await mockApi(page, {
      me: e2eAdmin(),
      adminListings: [
        e2eAdminListing({
          id: 'listing-inspect-1',
          title: 'E2E Rocking Horse',
          ownerFirstName: 'Nora',
          ownerLastName: 'Narekyan',
        }),
      ],
    });

    await page.goto('/admin/review/listing-inspect-1');

    // Desktop dossier shows the title twice (breadcrumb crumb + <h1>).
    await expect(page.getByRole('heading', { name: 'E2E Rocking Horse' })).toBeVisible();
    await expect(page.locator('.owner-trust-panel__name')).toContainText('Nora Narekyan');
    await expect(page.getByText('Compliance checklist')).toBeVisible();
  });

  test('legacy /admin/listings/pending path redirects to /admin/review', async ({ page }) => {
    await mockApi(page, { me: e2eAdmin() });

    await page.goto('/admin/listings/pending');

    await expect(page).toHaveURL(/\/admin\/review$/);
  });

  test('a failing approve rolls the listing back into the queue and shows an error toast', async ({
    page,
  }) => {
    await mockApi(page, {
      me: e2eAdmin(),
      adminListings: [e2eAdminListing({ id: 'listing-fail-1', title: 'E2E Balance Bike' })],
      adminApprove: { status: 500, body: { detail: 'Server error' } },
    });

    await page.goto('/admin/review');
    await expect(page.getByText('E2E Balance Bike')).toBeVisible();

    await page.locator('.review-card__btn--approve').click();

    // The UI is optimistic — a silent-swallow regression here would show
    // moderators a false success while the backend actually rejected it.
    await expect(page.getByText('Action failed')).toBeVisible();
    await expect(page.getByText('E2E Balance Bike')).toBeVisible();
  });
});
