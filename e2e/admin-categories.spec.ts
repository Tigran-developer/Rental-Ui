import { expect, test } from '@playwright/test';

import { mockApi } from './support/api-mock';
import { e2eAdmin, e2eAdminCategory } from './support/fixtures';

/**
 * Critical journey: an admin curates the toy-category taxonomy at `/admin/categories`
 * (`CategoriesPageComponent`). Backend stays stubbed at the network layer — see
 * `support/api-mock.ts`'s `adminCategories` seed, which keeps an in-memory working copy so
 * create/rename/visibility/reorder/delete mutations are observable across the page's
 * refetch-after-mutation, same convention as `admin-moderation.spec.ts`'s `adminListings`.
 *
 * `Listing.CategoryId` is non-nullable on the backend, so the delete-with-reassign guard is the
 * single most important assertion in this suite: bypassing it would strand live listings with
 * no category.
 */
test.describe('Admin categories', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'e2e-jwt-token');
    });
  });

  test('deleting a category with listings disables confirm until a reassign target is chosen', async ({
    page,
  }) => {
    await mockApi(page, {
      me: e2eAdmin(),
      adminCategories: [
        e2eAdminCategory({ id: 'cat-wooden', name: 'Wooden Toys', listingCount: 3, displayOrder: 0 }),
        e2eAdminCategory({ id: 'cat-puzzles', name: 'Puzzles', listingCount: 0, displayOrder: 1 }),
      ],
    });

    await page.goto('/admin/categories');
    await expect(page.getByText('Wooden Toys')).toBeVisible();

    await page.getByRole('button', { name: 'Delete Wooden Toys' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const confirmBtn = dialog.locator('.category-delete-dialog__btn--confirm');

    // The single most important assertion in this suite: an admin must not be able to delete a
    // category with live listings without picking where those listings go.
    await expect(confirmBtn).toBeDisabled();

    await dialog.locator('.category-delete-dialog__select').selectOption('cat-puzzles');
    await expect(confirmBtn).toBeEnabled();

    const deleteRequest = page.waitForRequest(
      (req) => req.url().includes('/api/admin/categories/cat-wooden') && req.method() === 'DELETE',
    );
    await confirmBtn.click();
    const request = await deleteRequest;
    expect(new URL(request.url()).searchParams.get('reassignToCategoryId')).toBe('cat-puzzles');

    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Wooden Toys')).toHaveCount(0);
  });

  test('deleting an empty category needs no reassign target and succeeds immediately', async ({
    page,
  }) => {
    await mockApi(page, {
      me: e2eAdmin(),
      adminCategories: [
        e2eAdminCategory({ id: 'cat-empty', name: 'Ride-Ons', listingCount: 0, displayOrder: 0 }),
      ],
    });

    await page.goto('/admin/categories');
    await expect(page.getByText('Ride-Ons')).toBeVisible();

    await page.getByRole('button', { name: 'Delete Ride-Ons' }).click();
    const dialog = page.getByRole('dialog');
    const confirmBtn = dialog.locator('.category-delete-dialog__btn--confirm');

    // No listings to reassign — confirm is enabled without picking a target.
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Ride-Ons')).toHaveCount(0);
  });

  test('reordering sends the complete ordered id list, not just the moved item', async ({
    page,
  }) => {
    await mockApi(page, {
      me: e2eAdmin(),
      adminCategories: [
        e2eAdminCategory({ id: 'cat-a', name: 'Alpha Toys', displayOrder: 0 }),
        e2eAdminCategory({ id: 'cat-b', name: 'Beta Toys', displayOrder: 1 }),
        e2eAdminCategory({ id: 'cat-c', name: 'Gamma Toys', displayOrder: 2 }),
      ],
    });

    await page.goto('/admin/categories');
    await expect(page.getByText('Alpha Toys')).toBeVisible();

    // The backend rejects a partial reorder list (admin.category_order_mismatch) — a request
    // carrying only the moved id would silently corrupt every other category's position.
    const reorderRequest = page.waitForRequest(
      (req) => req.url().endsWith('/api/admin/categories/reorder') && req.method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Move Alpha Toys down' }).click();
    const request = await reorderRequest;
    const body = request.postDataJSON() as { orderedIds: string[] };

    expect(body.orderedIds).toHaveLength(3);
    expect(body.orderedIds).toEqual(expect.arrayContaining(['cat-a', 'cat-b', 'cat-c']));
    // Alpha moved down past Beta — the swap the click requested.
    expect(body.orderedIds).toEqual(['cat-b', 'cat-a', 'cat-c']);
  });

  test('visibility toggle round-trips between Visible and Hidden', async ({ page }) => {
    await mockApi(page, {
      me: e2eAdmin(),
      adminCategories: [
        e2eAdminCategory({ id: 'cat-vis', name: 'Outdoor Toys', isVisible: true, displayOrder: 0 }),
      ],
    });

    await page.goto('/admin/categories');
    const row = page.locator('.categories-page__row').filter({ hasText: 'Outdoor Toys' });
    const toggle = row.getByRole('switch');

    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(row.locator('.category-visibility-toggle__label')).toHaveText('Visible');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(row.locator('.category-visibility-toggle__label')).toHaveText('Hidden');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(row.locator('.category-visibility-toggle__label')).toHaveText('Visible');
  });

  test('renaming a category on mobile opens the bottom edit sheet (not the desktop inline row)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, {
      me: e2eAdmin(),
      adminCategories: [
        e2eAdminCategory({ id: 'cat-mobile', name: 'Building Blocks', displayOrder: 0 }),
      ],
    });

    await page.goto('/admin/categories');
    await expect(page.getByText('Building Blocks')).toBeVisible();

    await page.getByRole('button', { name: 'Change' }).click();
    const sheet = page.locator('.category-edit-sheet');
    await expect(sheet).toBeVisible();
    await expect(page.locator('.categories-page__edit-row')).toHaveCount(0);

    await sheet.locator('.category-form-panel__name-input').fill('Wooden Blocks');
    await sheet.locator('.category-edit-sheet__btn--confirm').click();

    await expect(sheet).toHaveCount(0);
    await expect(page.getByText('Wooden Blocks')).toBeVisible();
  });
});
