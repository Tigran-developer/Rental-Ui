import { expect, test } from '@playwright/test';

import { mockApi } from './support/api-mock';
import { e2eAdmin, e2eAdminUser } from './support/fixtures';

/**
 * Critical journey: an admin manages accounts at `/admin/users` (`UsersPageComponent`).
 * Backend stays stubbed at the network layer — see `support/api-mock.ts`'s `adminUsers` seed,
 * which keeps an in-memory working copy so verify/suspend/reactivate mutations are observable
 * across the page's refetch-after-mutation, same convention as `admin-moderation.spec.ts`'s
 * `adminListings`.
 *
 * The server enforces `admin.cannot_suspend_self` / `admin.cannot_suspend_admin` regardless of
 * what the UI sends, but the UI must never present an impossible action in the first place —
 * that guard (`canSuspendUser` in `utils/admin-user-guards.util.ts`) is this suite's most
 * important assertion.
 */
test.describe('Admin users', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'e2e-jwt-token');
    });
  });

  test('suspend is disabled for the signed-in admin\'s own row and for any Admin row', async ({
    page,
  }) => {
    await mockApi(page, {
      me: e2eAdmin({ id: 'admin-self-1', firstName: 'Ann', lastName: 'Admin' }),
      adminUsers: [
        e2eAdminUser({
          id: 'admin-self-1',
          firstName: 'Ann',
          lastName: 'Admin',
          role: 'Admin',
          status: 'Active',
        }),
        e2eAdminUser({
          id: 'admin-other-1',
          firstName: 'Oleg',
          lastName: 'Otheradmin',
          role: 'Admin',
          status: 'Active',
        }),
        e2eAdminUser({
          id: 'user-normal-1',
          firstName: 'Nara',
          lastName: 'Normal',
          role: 'User',
          status: 'Active',
        }),
      ],
    });

    await page.goto('/admin/users');
    await expect(page.getByText('Ann Admin')).toBeVisible();

    // Own row.
    await page.getByRole('button', { name: 'Actions for Ann Admin' }).click();
    await expect(page.getByRole('menuitem', { name: 'Suspend' })).toBeDisabled();
    await page.locator('.admin-user-actions-panel__backdrop').click();

    // Another admin's row.
    await page.getByRole('button', { name: 'Actions for Oleg Otheradmin' }).click();
    await expect(page.getByRole('menuitem', { name: 'Suspend' })).toBeDisabled();
    await page.locator('.admin-user-actions-panel__backdrop').click();

    // A plain user row — suspend is offered and enabled.
    await page.getByRole('button', { name: 'Actions for Nara Normal' }).click();
    await expect(page.getByRole('menuitem', { name: 'Suspend' })).toBeEnabled();
  });

  test('suspend moves a user to Suspended; reactivate moves them back to Active', async ({
    page,
  }) => {
    await mockApi(page, {
      me: e2eAdmin(),
      adminUsers: [
        e2eAdminUser({ id: 'user-normal-1', firstName: 'Nara', lastName: 'Normal', status: 'Active' }),
      ],
    });

    await page.goto('/admin/users');
    const row = page.locator('.users-page__row').filter({ hasText: 'Nara Normal' });
    await expect(row.locator('.admin-user-status-pill--active')).toBeVisible();

    await page.getByRole('button', { name: 'Actions for Nara Normal' }).click();
    await page.getByRole('menuitem', { name: 'Suspend' }).click();

    await expect(row.locator('.admin-user-status-pill--suspended')).toBeVisible();
    await expect(row.locator('.admin-user-status-pill--active')).toHaveCount(0);

    await page.getByRole('button', { name: 'Actions for Nara Normal' }).click();
    await page.getByRole('menuitem', { name: 'Reactivate' }).click();

    await expect(row.locator('.admin-user-status-pill--active')).toBeVisible();
    await expect(row.locator('.admin-user-status-pill--suspended')).toHaveCount(0);
  });

  test('suspending a user from inside the profile dialog on the Pending ID tab updates the dialog itself', async ({
    page,
  }) => {
    await mockApi(page, {
      me: e2eAdmin(),
      adminUsers: [
        e2eAdminUser({
          id: 'user-pending-1',
          firstName: 'Puja',
          lastName: 'Pending',
          role: 'User',
          status: 'Pending',
        }),
      ],
    });

    await page.goto('/admin/users');
    await page.getByRole('tab', { name: 'Pending ID' }).click();
    await expect(page.getByText('Puja Pending')).toBeVisible();

    // Suspending moves the row off the Pending ID tab's filtered `items()` — the exact path the
    // stale-dialog bug broke. The fix (`users-page.component.ts`) applies `suspendUserSuccess`'s
    // own authoritative row straight to the dialog snapshot, independent of `items()`.
    await page.getByRole('button', { name: "View Puja Pending's profile" }).click();
    const dialog = page.getByRole('dialog', { name: "Puja Pending's profile" });
    await expect(dialog.locator('.admin-user-status-pill--pending')).toBeVisible();

    await dialog.locator('.admin-user-profile-dialog__action--danger').click();

    await expect(dialog.locator('.admin-user-status-pill--suspended')).toBeVisible();
    await expect(dialog.locator('.admin-user-profile-dialog__action--success')).toBeVisible();
    await expect(dialog.locator('.admin-user-profile-dialog__action--danger')).toHaveCount(0);
  });

  test('status tabs request the right status, and there is no "Active" tab', async ({ page }) => {
    await mockApi(page, {
      me: e2eAdmin(),
      adminUsers: [
        e2eAdminUser({ id: 'user-1', firstName: 'Nara', lastName: 'Normal', status: 'Active' }),
        e2eAdminUser({ id: 'user-2', firstName: 'Puja', lastName: 'Pending', status: 'Pending' }),
      ],
    });

    await page.goto('/admin/users');
    await expect(page.getByText('Nara Normal')).toBeVisible();

    // "active" is a valid row status but deliberately not an offered filter value.
    await expect(page.getByRole('tab', { name: 'Active' })).toHaveCount(0);

    const pendingRequest = page.waitForRequest(
      (req) => req.url().includes('/api/admin/users') && req.url().includes('status=pending'),
    );
    await page.getByRole('tab', { name: 'Pending ID' }).click();
    await pendingRequest;

    const allRequest = page.waitForRequest(
      (req) => req.url().includes('/api/admin/users') && req.url().includes('status=all'),
    );
    await page.getByRole('tab', { name: 'All' }).click();
    await allRequest;

    const suspendedRequest = page.waitForRequest(
      (req) => req.url().includes('/api/admin/users') && req.url().includes('status=suspended'),
    );
    await page.getByRole('tab', { name: 'Suspended' }).click();
    await suspendedRequest;
  });

  test('the mobile actions sheet renders a visible disabled-reason and a Cancel button', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, {
      me: e2eAdmin({ id: 'admin-self-1', firstName: 'Ann', lastName: 'Admin' }),
      adminUsers: [
        e2eAdminUser({
          id: 'admin-self-1',
          firstName: 'Ann',
          lastName: 'Admin',
          role: 'Admin',
          status: 'Active',
        }),
      ],
    });

    await page.goto('/admin/users');
    await page.getByRole('button', { name: 'Actions for Ann Admin' }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    // Desktop only surfaces the reason via a `title` attribute; the mobile sheet renders it as
    // visible body text — that's the genuinely different interaction this test earns its keep on.
    await expect(sheet.getByText("You can't suspend your own account.")).toBeVisible();
    await expect(sheet.locator('.admin-user-actions-panel__sheet-btn--danger')).toBeDisabled();

    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet).toHaveCount(0);
  });
});
