import { expect, test } from '@playwright/test';

import { mockApi } from './support/api-mock';
import { e2eListingDetails, e2eListingImages, e2eToyReviewSummary } from './support/fixtures';

/**
 * The redesigned details page (breadcrumb, gallery mosaic + lightbox,
 * highlights band, specs quad, review summary with distribution bars) is
 * careful to only ever render real, data-backed content — this suite pins the
 * states most likely to regress that: a fabricated rating below the
 * review-aggregate threshold, mosaic layout at the edges of its 1–5+ photo
 * range, lightbox a11y, and blocks that must disappear rather than render
 * empty/zero.
 */
test.describe('Listing details — review aggregate gate', () => {
  test('never renders a 0.0 rating below the aggregate threshold', async ({ page }) => {
    // hasAggregate: false, overallAverage: 0 — exactly what the backend sends
    // for a listing with fewer than 2 reviews, but WITH a real comment (so the
    // page takes the "has reviews" branch, not the separate zero-reviews empty
    // state) — the trap this test guards is a fabricated *rating*, not an
    // empty list.
    await mockApi(page, {
      listingDetails: e2eListingDetails(),
      listingToyReviews: e2eToyReviewSummary(),
    });

    await page.goto('/listings/listing-e2e-1');

    const summaryPanel = page.locator('.detail-page__reviews-summary-panel');
    await expect(summaryPanel).toBeVisible();
    await expect(summaryPanel.locator('.rating-summary__empty')).toHaveText('No reviews yet');
    // The numeric average/star-row branch must not have rendered at all.
    await expect(summaryPanel.locator('.rating-summary__big-number')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('0.0');
  });
});

test.describe('Listing details — gallery mosaic degradation', () => {
  test('a single image renders one solo tile with no "All photos" control', async ({ page }) => {
    await mockApi(page, {
      listingDetails: e2eListingDetails({ images: e2eListingImages(1) }),
    });

    await page.goto('/listings/listing-e2e-1');

    await expect(page.locator('.listing-gallery__mtile--solo')).toBeVisible();
    await expect(page.locator('.listing-gallery__mtile-allphotos')).toHaveCount(0);
  });

  test('7 images: the mosaic shows only 5 tiles behind an accurate "All 7 photos" control', async ({
    page,
  }) => {
    await mockApi(page, {
      listingDetails: e2eListingDetails({ images: e2eListingImages(7) }),
    });

    await page.goto('/listings/listing-e2e-1');

    await expect(page.locator('.listing-gallery__mosaic .listing-gallery__mtile-img')).toHaveCount(5);
    await expect(page.locator('.listing-gallery__mtile-allphotos')).toHaveText('All 7 photos');
  });
});

test.describe('Listing details — lightbox dismiss paths & a11y', () => {
  // `listing-gallery.component.html`'s lightbox sets `[closable]="false"` on
  // its `<p-dialog>` to suppress PrimeNG's default header close icon in
  // favour of the component's own round close button. That one flag turned
  // out to gate two more PrimeNG behaviours besides the icon:
  // `Dialog.bindGlobalListeners()` only binds the document Escape listener
  // when `closeOnEscape && closable`, and `Dialog.enableModality()` only
  // binds its own mask-click listener when `closable && dismissableMask`
  // (both in `node_modules/primeng/fesm2022/primeng-dialog.mjs`) — so
  // `closable=false` silently defeated Escape-to-close and
  // click-outside-to-close as a side effect of hiding an icon. The same
  // `[closable]="false"` pair exists in `listing-location-map.component.html`
  // (the full-screen map dialog), so it was a repeatable trap, not a
  // one-off. Both gaps are now closed: `ListingGalleryComponent` owns
  // Escape (`window:keydown`) and mask-click (`window:mousedown`, gated on
  // `event.target` being the mask element itself, so a click that starts
  // inside the dialog content never dismisses it) itself, independent of
  // PrimeNG's gate, and funnels every dismiss path — close button, Escape,
  // mask click — through the same `onLightboxVisibleChange()`. That's why
  // both tests below also assert focus returns to the trigger: it's one
  // fix, not three, so the tests pin it at both dismiss paths this suite
  // owns (the map dialog's own Escape fix is out of scope here).
  test('opens on tile click, closes on Escape, and returns focus to the trigger', async ({
    page,
  }) => {
    await mockApi(page, {
      listingDetails: e2eListingDetails({ images: e2eListingImages(1) }),
    });

    await page.goto('/listings/listing-e2e-1');

    const trigger = page.locator('.listing-gallery__mtile--solo');
    await trigger.click();

    // Scoped to the dialog that actually contains the gallery's lightbox
    // content rather than a bare `getByRole('dialog')`. That used to be
    // load-bearing, not just tidy: `listing-location-map.component.html`
    // hardcoded a static `role="dialog"` on its `appendTo="body"` HOST tag
    // (redundant with `p-dialog`'s own `role` input, which already applies
    // `role="dialog"` to the real rendered container, not the host), and
    // because the real dialog content portals to `<body>` only while open,
    // the host was left behind as a phantom empty `role="dialog"` element
    // at ALL times — a false landmark for assistive tech on every
    // listing-details page. That hardcoded role is removed now (zero
    // `[role="dialog"]` before either dialog opens, exactly one while a
    // dialog is open), but the `.filter()` stays: it's the correct way to
    // identify "the lightbox" specifically regardless of how many other
    // dialogs the page has.
    const dialog = page
      .getByRole('dialog')
      .filter({ has: page.locator('.listing-gallery__lightbox') });
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('closes when the mask is clicked and returns focus to the trigger, but ignores a click inside the dialog content', async ({
    page,
  }) => {
    await mockApi(page, {
      listingDetails: e2eListingDetails({ images: e2eListingImages(1) }),
    });

    await page.goto('/listings/listing-e2e-1');

    const trigger = page.locator('.listing-gallery__mtile--solo');
    await trigger.click();

    const dialog = page
      .getByRole('dialog')
      .filter({ has: page.locator('.listing-gallery__lightbox') });
    await expect(dialog).toBeVisible();

    // Negative case first, while the dialog is still open: a click that
    // starts on real dialog content (the image) must NOT reach the mask
    // handler. `onWindowMousedown()` only closes when `event.target` IS
    // the mask element itself — a gate that's easy to loosen by accident
    // (e.g. widening it to "target is inside the mask" instead of "target
    // is the mask"), which is exactly the regression this guards against.
    await page.locator('.listing-gallery__lightbox-img').click();
    await expect(dialog).toBeVisible();

    // The mask is PrimeNG's full-viewport overlay; the lightbox itself is
    // centered within it (92vw x 86vh), so clicking the mask locator's own
    // center would hit the dialog content sitting on top of it, not the
    // mask. Targeting a corner of the mask element (rather than weakening
    // this to a raw page-coordinate click) avoids that — except the
    // top-left corner: the site's fixed nav header (`.nh__inner`) still
    // receives clicks near the top of the viewport even with the lightbox
    // open, so `(5, 5)` is a false negative for "did the mask handler
    // fire". The bottom-left corner has no such obstruction.
    const mask = page.locator('.listing-gallery__lightbox-mask');
    const maskBox = await mask.boundingBox();
    if (!maskBox) {
      throw new Error('lightbox mask has no bounding box while the lightbox is open');
    }
    await mask.click({ position: { x: 5, y: maskBox.height - 5 } });

    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe('Listing details — blocks absent when their data is absent', () => {
  test('highlights band stays hidden with only one data-backed tile', async ({ page }) => {
    // hygieneNotes is the only highlight-eligible field set: deliveryType is
    // null (no delivery tile), minRentalDays is 1 (no min-stay tile), and the
    // owner-verified badge depends on an unseeded public profile (false). One
    // real tile is not enough — the band only ever renders at 2–4.
    await mockApi(page, {
      listingDetails: e2eListingDetails({
        hygieneNotes: 'Washed with baby-safe detergent',
        deliveryType: null,
        minRentalDays: 1,
      }),
    });

    await page.goto('/listings/listing-e2e-1');

    await expect(page.locator('.detail-page__highlights')).toHaveCount(0);
  });

  test('deposit spec tile is absent when depositAmount is null', async ({ page }) => {
    await mockApi(page, {
      listingDetails: e2eListingDetails({
        depositAmount: null,
        ageFromMonths: 24,
        ageToMonths: 60,
        condition: 'Good',
        deliveryType: 'Pickup',
      }),
    });

    await page.goto('/listings/listing-e2e-1');

    const specQuad = page.locator('.detail-page__specquad');
    await expect(specQuad).toBeVisible();
    // Age + condition + delivery = 3 cells; deposit would make it 4.
    await expect(specQuad.locator('.detail-page__specquad-cell')).toHaveCount(3);
    await expect(specQuad).not.toContainText('Refundable deposit');
  });

  test('breadcrumb has no category segment when the category is missing', async ({ page }) => {
    await mockApi(page, {
      listingDetails: e2eListingDetails({ category: null }),
    });

    await page.goto('/listings/listing-e2e-1');

    const breadcrumb = page.locator('.detail-page__breadcrumb');
    // Home, sep, Listings, sep, title = 5 <li>s with no category present.
    await expect(breadcrumb.locator('li')).toHaveCount(5);
  });
});
