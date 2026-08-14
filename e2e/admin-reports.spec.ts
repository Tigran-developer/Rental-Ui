import { expect, test } from '@playwright/test';

import { mockApi } from './support/api-mock';
import { e2eAdmin, e2eAdminReport } from './support/fixtures';

/**
 * Critical journey: an admin triages community reports at `/admin/reports`
 * (`ReportsPageComponent`). Backend stays stubbed at the network layer — see
 * `support/api-mock.ts`'s `adminReports` seed, which keeps an in-memory working copy so
 * resolve/dismiss/reopen mutations are observable across the page's refetch-after-mutation,
 * same convention as `admin-moderation.spec.ts`'s `adminListings`.
 *
 * The Users screen's `/admin/reports?userId=<id>` deep link is its own journey below: a
 * dismissed filter must clear both the store filter AND the URL query param, so a refresh can't
 * silently re-apply a filter the admin already backed out of.
 */
test.describe('Admin reports', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'e2e-jwt-token');
    });
  });

  test('resolving an open report leaves the Open tab and updates the counts', async ({ page }) => {
    await mockApi(page, {
      me: e2eAdmin(),
      adminReports: [
        e2eAdminReport({ id: 'report-1', targetLabel: 'Wobbly Bike', status: 'Open' }),
      ],
    });

    await page.goto('/admin/reports');
    await expect(page.getByText('Wobbly Bike')).toBeVisible();
    const openTab = page.getByRole('tab', { name: /Open/ });
    const resolvedTab = page.getByRole('tab', { name: /Resolved/ });
    await expect(openTab.locator('.admin-tabs__count')).toHaveText('1');
    await expect(resolvedTab.locator('.admin-tabs__count')).toHaveText('0');

    await page.locator('.reports-page__action-btn--resolve').click();

    await expect(page.getByText('Wobbly Bike')).toHaveCount(0);
    await expect(openTab.locator('.admin-tabs__count')).toHaveText('0');
    await expect(resolvedTab.locator('.admin-tabs__count')).toHaveText('1');
  });

  test('reopening a resolved report returns it to the Open tab', async ({ page }) => {
    await mockApi(page, {
      me: e2eAdmin(),
      adminReports: [
        e2eAdminReport({ id: 'report-2', targetLabel: 'Scratched Scooter', status: 'Resolved' }),
      ],
    });

    await page.goto('/admin/reports');
    await page.getByRole('tab', { name: /Resolved/ }).click();
    await expect(page.getByText('Scratched Scooter')).toBeVisible();

    await page.locator('.reports-page__action-btn--reopen').click();

    await expect(page.getByText('Scratched Scooter')).toHaveCount(0);
    const openTab = page.getByRole('tab', { name: /Open/ });
    await expect(openTab.locator('.admin-tabs__count')).toHaveText('1');

    await openTab.click();
    await expect(page.getByText('Scratched Scooter')).toBeVisible();
  });

  test('resolving a report from inside the dialog on the Open tab updates the dialog itself', async ({
    page,
  }) => {
    await mockApi(page, {
      me: e2eAdmin(),
      adminReports: [
        e2eAdminReport({ id: 'report-6', targetLabel: 'Squeaky Duck', status: 'Open' }),
      ],
    });

    await page.goto('/admin/reports');
    await expect(page.getByText('Squeaky Duck')).toBeVisible();

    // Default tab is Open — this is the exact path the stale-dialog bug broke: resolving moves
    // the row off this tab's filtered `items()`, so a dialog kept live only by re-finding itself
    // there would freeze on stale "Open" data forever. The fix (`reports-page.component.ts`)
    // applies `resolveReportSuccess`'s own authoritative row straight to the dialog snapshot,
    // independent of `items()` — assert on that directly rather than routing around it.
    await page.locator('.reports-page__action-btn--open').click();
    const dialog = page.locator('.admin-report-detail-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.admin-report-status-pill--open')).toBeVisible();

    await dialog.locator('.admin-report-detail-dialog__btn--resolve').click();

    await expect(dialog.locator('.admin-report-status-pill--resolved')).toBeVisible();
    await expect(dialog.locator('.admin-report-detail-dialog__btn--reopen')).toBeVisible();
    await expect(dialog.locator('.admin-report-detail-dialog__btn--resolve')).toHaveCount(0);
  });

  test('a failing resolve from inside the dialog reverts it to the true prior Open state and surfaces the error', async ({
    page,
  }) => {
    await mockApi(page, {
      me: e2eAdmin(),
      adminReports: [
        e2eAdminReport({ id: 'report-7', targetLabel: 'Leaky Water Gun', status: 'Open' }),
      ],
      adminReportResolve: { status: 500, body: { detail: 'Server error' } },
    });

    await page.goto('/admin/reports');
    await page.locator('.reports-page__action-btn--open').click();
    const dialog = page.locator('.admin-report-detail-dialog');
    await expect(dialog.locator('.admin-report-status-pill--open')).toBeVisible();

    await dialog.locator('.admin-report-detail-dialog__btn--resolve').click();

    // The fix never touches the dialog snapshot optimistically — it only applies the mutation's
    // *successful* response. On failure, restoring the dialog is still entirely the pre-existing
    // `items()`-driven effect's job: `rollbackMutation` puts the row back at its original index,
    // the row re-matches the Open tab, and the effect picks it back up. Pin that it still does.
    await expect(page.getByText('Action failed')).toBeVisible();
    await expect(dialog.locator('.admin-report-status-pill--open')).toBeVisible();
    await expect(dialog.locator('.admin-report-detail-dialog__btn--resolve')).toBeVisible();
    await expect(dialog.locator('.admin-report-detail-dialog__btn--reopen')).toHaveCount(0);
  });

  test('the userId deep link filters to that user and clears both filter and URL on dismiss', async ({
    page,
  }) => {
    const userId = '11111111-2222-4333-8444-555555555555';
    await mockApi(page, {
      me: e2eAdmin(),
      adminReports: [
        e2eAdminReport({
          id: 'report-3',
          targetType: 'User',
          targetId: userId,
          targetLabel: 'Renata Renter',
          status: 'Open',
        }),
        // A report against something else — must NOT show up once the filter is active.
        e2eAdminReport({ id: 'report-4', targetType: 'Listing', targetLabel: 'Unrelated Toy' }),
      ],
    });

    const filteredRequest = page.waitForRequest(
      (req) =>
        req.url().includes('/api/admin/reports') &&
        req.url().includes('targetType=User') &&
        req.url().includes(`targetId=${userId}`),
    );
    await page.goto(`/admin/reports?userId=${userId}`);
    await filteredRequest;

    await expect(page.locator('.reports-page__target', { hasText: 'Renata Renter' })).toBeVisible();
    await expect(page.getByText('Unrelated Toy')).toHaveCount(0);
    const filterBanner = page.locator('.reports-page__filter-banner');
    await expect(filterBanner).toContainText('filtered to this user');

    await page.locator('.reports-page__filter-banner-clear').click();

    await expect(filterBanner).toHaveCount(0);
    await expect(page).not.toHaveURL(/userId=/);
  });

  test('the mobile detail dialog renders as a bottom sheet and can resolve a report', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, {
      me: e2eAdmin(),
      adminReports: [
        e2eAdminReport({ id: 'report-5', targetLabel: 'Cracked Helmet', status: 'Open' }),
      ],
    });

    await page.goto('/admin/reports');
    await expect(page.getByText('Cracked Helmet')).toBeVisible();

    // Default tab is Open — the natural mobile journey (previously routed via "All" to dodge a
    // stale-dialog bug; the fix below makes the natural path safe to assert on directly). The
    // dialog stays live because it now applies `resolveReportSuccess`'s own row straight to its
    // snapshot, independent of `items()` — see `reports-page.component.ts` and the desktop
    // "resolving a report from inside the dialog on the Open tab" test above for the fix itself.
    await page.locator('.reports-page__action-btn--open').click();
    const sheet = page.locator('.admin-report-detail-dialog--sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.admin-report-status-pill--open')).toBeVisible();

    await sheet.locator('.admin-report-detail-dialog__btn--resolve').click();

    // The dialog stays open showing the now-live (refetched) status rather than closing itself
    // — Resolve/Dismiss give way to Reopen once the report is no longer Open.
    await expect(sheet.locator('.admin-report-status-pill--resolved')).toBeVisible();
    await expect(sheet.locator('.admin-report-detail-dialog__btn--reopen')).toBeVisible();
    await expect(sheet.locator('.admin-report-detail-dialog__btn--resolve')).toHaveCount(0);

    await sheet.locator('.admin-report-detail-dialog__close').click();
    await expect(sheet).toHaveCount(0);
    // Still on Open — now that the report is Resolved, the row has correctly left this tab's
    // list, confirming the mutation landed for real rather than only inside the dialog snapshot.
    await expect(page.getByText('Cracked Helmet')).toHaveCount(0);
  });
});
