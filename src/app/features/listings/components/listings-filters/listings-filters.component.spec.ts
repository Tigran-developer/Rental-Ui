import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';

import { ListingsApiService } from '../../services/listings-api.service';
import {
  selectListingCategories,
  selectListingsOriginCoords,
  selectListingsOriginDenied,
  selectListingsOriginSource,
} from '../../store/listings.selectors';
import { ListingsFiltersComponent } from './listings-filters.component';

/** Access to the sheet's protected surface without loosening it for production code. */
interface SheetAccess {
  applySheet(): void;
  clearSheet(): void;
  closeSheet(): void;
  openSheet(): void;
  onDraftRadiusMetersChange(meters: number): void;
  readonly draftForm: {
    getRawValue(): {
      city: string;
      categoryId: string;
      minPrice: number | null;
      maxPrice: number | null;
      radiusKm: number | null;
      districtIds: string[];
    };
    patchValue(value: Record<string, unknown>): void;
  };
}

/**
 * Regression coverage for M-021: the mobile filter sheet used to navigate
 * with `queryParamsHandling: 'replace'` and a `toQueryParams()` that only
 * ever emitted its own six keys — so applying/clearing the sheet silently
 * stripped ANY param it had no concept of, known or not (confirmed live:
 * `/listings?ageGroup=0-12&maxDistance=5` at 375px, tap "Apply" with zero
 * changes, URL became a bare `/listings`). Fixed by switching to `'merge'`.
 *
 * The radius filter (Maps P2 "location + radius" design) changed WHICH keys
 * this form owns: `radiusKm` (renamed from the old discrete-km
 * `maxDistance`) is now one of THIS form's own fields — like `districtIds`,
 * both the desktop sidebar and this sheet read/write the exact same URL
 * param, so there is only ever one copy of that state to drift, not two
 * surfaces that could disagree. `ageGroup`, by contrast, is STILL
 * desktop-sidebar-only — this file keeps both scenarios apart so a future
 * change can't quietly re-introduce the M-021 shape by giving the sheet a
 * field it silently doesn't round-trip.
 */
async function navigateToListings(url: string): Promise<{
  component: ListingsFiltersComponent & SheetAccess;
  router: Router;
}> {
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([{ path: 'listings', component: ListingsFiltersComponent }]),
      provideMockStore({
        selectors: [
          { selector: selectListingCategories, value: [] },
          { selector: selectListingsOriginCoords, value: null },
          { selector: selectListingsOriginSource, value: null },
          { selector: selectListingsOriginDenied, value: false },
        ],
      }),
      { provide: ListingsApiService, useValue: { getDistricts: () => of([]) } },
      { provide: MessageService, useValue: { add: vi.fn() } },
    ],
    teardown: { destroyAfterEach: true },
  });

  const harness = await RouterTestingHarness.create();
  const component = await harness.navigateByUrl(url, ListingsFiltersComponent);
  harness.detectChanges();

  return {
    component: component as unknown as ListingsFiltersComponent & SheetAccess,
    router: TestBed.inject(Router),
  };
}

describe('ListingsFiltersComponent — cross-surface query param preservation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('tapping Apply with no changes preserves ageGroup (not sheet-owned) AND radiusKm (sheet-owned, round-tripped unchanged)', async () => {
    const { component, router } = await navigateToListings(
      '/listings?ageGroup=0-12&radiusKm=5',
    );

    component.openSheet();
    component.applySheet();
    await vi.advanceTimersByTimeAsync(350); // flush the form's debounceTime(300)

    expect(router.url).toBe('/listings?ageGroup=0-12&radiusKm=5');
  });

  it('tapping Clear resets the sheet-owned radiusKm to null but still preserves ageGroup (not sheet-owned)', async () => {
    const { component, router } = await navigateToListings(
      '/listings?ageGroup=0-12&radiusKm=5',
    );

    component.openSheet();
    component.clearSheet();
    await vi.advanceTimersByTimeAsync(350);

    const url = router.url;
    expect(url).toContain('ageGroup=0-12');
    expect(url).not.toContain('radiusKm=');
  });

  it('applying a sheet-owned filter (city) still merges in alongside ageGroup and an existing radiusKm', async () => {
    const { component, router } = await navigateToListings(
      '/listings?ageGroup=0-12&radiusKm=5',
    );

    component.openSheet();
    component.draftForm.patchValue({ city: 'Yerevan' });
    component.applySheet();
    await vi.advanceTimersByTimeAsync(350);

    const url = router.url;
    expect(url).toContain('ageGroup=0-12');
    expect(url).toContain('radiusKm=5');
    expect(url).toContain('city=Yerevan');
  });

  it('clearing a sheet-owned filter actually removes its own param from the URL (merge still deletes what it owns)', async () => {
    const { component, router } = await navigateToListings(
      '/listings?ageGroup=0-12&radiusKm=5&city=Yerevan&categoryId=abc',
    );

    component.openSheet();
    component.clearSheet();
    await vi.advanceTimersByTimeAsync(350);

    const url = router.url;
    // Sheet-owned filters actually cleared out of the URL...
    expect(url).not.toContain('city=');
    expect(url).not.toContain('categoryId=');
    expect(url).not.toContain('radiusKm=');
    // ...while a filter the sheet doesn't know about survives untouched.
    expect(url).toContain('ageGroup=0-12');
  });

  it('adjusting the radius in the sheet and applying commits the new value to the URL, merged with ageGroup', async () => {
    const { component, router } = await navigateToListings('/listings?ageGroup=0-12');

    component.openSheet();
    component.onDraftRadiusMetersChange(3000); // 3 km
    component.applySheet();
    await vi.advanceTimersByTimeAsync(350);

    const url = router.url;
    expect(url).toContain('ageGroup=0-12');
    expect(url).toContain('radiusKm=3');
  });

  it('closing the sheet without applying (Cancel) never touches the URL at all', async () => {
    const { component, router } = await navigateToListings('/listings?ageGroup=0-12&radiusKm=5');

    component.openSheet();
    component.onDraftRadiusMetersChange(10000); // 10 km, drafted but not applied
    component.closeSheet();
    await vi.advanceTimersByTimeAsync(350);

    expect(router.url).toBe('/listings?ageGroup=0-12&radiusKm=5');
  });
});
