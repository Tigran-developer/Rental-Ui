import { expect, test } from '@playwright/test';

import { mockApi } from './support/api-mock';
import { mockTiles } from './support/tile-mock';

/**
 * Regression for a confirmed live-verification defect (commit 3f4a225): the
 * full-screen location-picker's floating hint card (`hintTitleKey`, used by
 * `RadiusOriginFilterComponent`'s "pick a point on the map" picker) used to
 * be a SINGLE element that was both the visible white card and its own
 * `left:14/right:14` positioning box. On a desktop-width map its background
 * stretched edge-to-edge and physically sat on top of `app-map`'s own
 * top-right zoom stack (z-index 1003 vs. the zoom stack's 1002) —
 * `elementFromPoint()` on the zoom buttons resolved to the hint, so neither a
 * click nor a touch tap could reach them, and a `mousedown` anywhere in that
 * top strip hit the hint instead of starting a map drag.
 *
 * `location-picker.component.spec.ts` (unit/jsdom) already regression-tests
 * the DOM split (hollow wrapper vs. nested card) and the `pointer-events`
 * CSS that fixes this — but jsdom has no layout engine, so it cannot prove
 * the buttons are actually reachable at their real on-screen position; that
 * spec's own doc comment says so explicitly. This spec proves exactly that,
 * in a real browser: `elementFromPoint()` at the zoom-in button's own centre
 * must resolve to the button, a real click there must reach it, and a drag
 * started under the (now hollow) hint strip must reach the map instead of
 * being swallowed.
 *
 * Confirmed red on the pre-fix markup/styles (reverted
 * location-picker.component.{html,scss} to the parent of 3f4a225, this spec
 * run against that) before being added here — see the qa-engineer report
 * for how.
 */
test.describe('Location picker — hint card must not swallow zoom/drag input', () => {
  test('zoom button is reachable under the hint card', async ({ page }) => {
    const tiles = await mockTiles(page);
    await mockApi(page, { listings: [] });

    await page.goto('/listings');
    await page.getByRole('button', { name: 'or pick a point on the map' }).click();

    const dialog = page.locator('.p-dialog.location-picker-dialog');
    await expect(dialog).toBeVisible();
    // Wait for the real Leaflet map to finish its first tile load — proof the
    // dialog's layout (hint card + zoom stack included) has settled rather
    // than still being mid-open-animation.
    await expect.poll(() => tiles.count()).toBeGreaterThan(0);

    const zoomInBtn = dialog.locator('.app-map__zoom-stack .app-map__zoom-btn').first();
    await expect(zoomInBtn).toBeVisible();
    const box = await zoomInBtn.boundingBox();
    if (!box) throw new Error('zoom-in button has no bounding box');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // The exact check the fix's own commit message describes verifying
    // live: the DOM node under the button's own centre point must be the
    // button itself, not an overlay sitting on top of it.
    const hitsZoomButton = await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.app-map__zoom-btn'),
      { x: cx, y: cy },
    );
    expect(hitsZoomButton).toBe(true);

    // Functional confirmation: a real click at that same point must reach
    // the button and trigger a zoom (a new tile fetch at the new zoom
    // level) — dispatched via raw coordinates (page.mouse), which, like a
    // real finger/mouse, goes to whatever the BROWSER's own hit-testing
    // puts on top at that point, the same mechanism the bug exploited.
    const tileCountBeforeZoom = tiles.count();
    await page.mouse.click(cx, cy);
    await expect.poll(() => tiles.count()).toBeGreaterThan(tileCountBeforeZoom);
  });

  test('a drag started under the hint strip pans the map', async ({ page }) => {
    await mockTiles(page);
    await mockApi(page, { listings: [] });

    await page.goto('/listings');
    await page.getByRole('button', { name: 'or pick a point on the map' }).click();

    const dialog = page.locator('.p-dialog.location-picker-dialog');
    const doneBtn = dialog.getByRole('button', { name: 'Done' });
    // `confirmDisabledUntilMoved` (RadiusOriginFilterComponent's own picker
    // config) keeps Done disabled until the crosshair has genuinely panned —
    // the cleanest observable proof a drag actually reached the real
    // Leaflet map, not merely that some DOM element absorbed the mouse
    // events.
    await expect(doneBtn).toBeDisabled();

    const hintBox = await dialog.locator('.location-picker__hint').boundingBox();
    const zoomStackBox = await dialog.locator('.app-map__zoom-stack').boundingBox();
    if (!hintBox || !zoomStackBox) throw new Error('hint or zoom-stack bounding box missing');

    // A point inside the (hollow, post-fix) hint wrapper's full-width band,
    // safely clear of both the hint CARD (left-anchored, narrow) and the
    // zoom stack (top-right) — squarely over empty map, exactly the strip
    // the bug report measured as swallowed pre-fix.
    const dragX = zoomStackBox.x - 80;
    const dragY = hintBox.y + hintBox.height / 2;

    await page.mouse.move(dragX, dragY);
    await page.mouse.down();
    await page.mouse.move(dragX - 150, dragY, { steps: 10 });
    await page.mouse.up();

    await expect(doneBtn).toBeEnabled();
  });
});
