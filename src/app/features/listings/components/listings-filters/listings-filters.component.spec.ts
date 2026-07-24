import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { ListingsApiService } from '../../services/listings-api.service';
import { selectListingCategories } from '../../store/listings.selectors';
import { ListingsFiltersComponent } from './listings-filters.component';

/** Access to the sheet's protected surface without loosening it for production code. */
interface SheetAccess {
  applySheet(): void;
  clearSheet(): void;
  openSheet(): void;
  readonly draftForm: {
    getRawValue(): {
      city: string;
      categoryId: string;
      minPrice: number | null;
      maxPrice: number | null;
      districtIds: string[];
    };
    patchValue(value: Record<string, unknown>): void;
  };
}

/**
 * Regression coverage for the mobile filter sheet stripping query params it
 * has no concept of (`ageGroup`, `maxDistance` — desktop-sidebar-only filters,
 * see `ListingsPageComponent`). Confirmed live: opening `/listings?ageGroup=
 * 0-12&maxDistance=5` at 375px and tapping "Apply" with zero changes turned
 * the URL into a bare `/listings`.
 *
 * Root cause: the sheet's internal `filterForm.valueChanges` subscription
 * navigated with `queryParamsHandling: 'replace'`, and `toQueryParams()` only
 * ever emits the sheet's OWN six keys (`q`, `city`, `categoryId`, `minPrice`,
 * `maxPrice`, `districtIds`) — so `replace` discarded anything else in the
 * URL, known or not. Fixed by switching to `'merge'`, matching every other
 * navigation in this feature (`ListingsPageComponent`'s sidebar already uses
 * `merge` exclusively). Because the sheet's own six keys are still always
 * present in the object (explicit `null` when cleared), `merge` still removes
 * them correctly — it only leaves keys the sheet never mentions untouched.
 */
async function navigateToListings(url: string): Promise<{
  component: ListingsFiltersComponent & SheetAccess;
  router: Router;
}> {
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([{ path: 'listings', component: ListingsFiltersComponent }]),
      provideMockStore({ selectors: [{ selector: selectListingCategories, value: [] }] }),
      { provide: ListingsApiService, useValue: { getDistricts: () => of([]) } },
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

  it('tapping Apply with no changes preserves ageGroup/maxDistance (the confirmed bug)', async () => {
    const { component, router } = await navigateToListings(
      '/listings?ageGroup=0-12&maxDistance=5',
    );

    component.openSheet();
    component.applySheet();
    await vi.advanceTimersByTimeAsync(350); // flush the form's debounceTime(300)

    expect(router.url).toBe('/listings?ageGroup=0-12&maxDistance=5');
  });

  it('tapping Clear with no sheet filters set preserves ageGroup/maxDistance', async () => {
    const { component, router } = await navigateToListings(
      '/listings?ageGroup=0-12&maxDistance=5',
    );

    component.openSheet();
    component.clearSheet();
    await vi.advanceTimersByTimeAsync(350);

    expect(router.url).toBe('/listings?ageGroup=0-12&maxDistance=5');
  });

  it('applying a sheet-owned filter (city) still merges in alongside ageGroup/maxDistance', async () => {
    const { component, router } = await navigateToListings(
      '/listings?ageGroup=0-12&maxDistance=5',
    );

    component.openSheet();
    component.draftForm.patchValue({ city: 'Yerevan' });
    component.applySheet();
    await vi.advanceTimersByTimeAsync(350);

    const url = router.url;
    expect(url).toContain('ageGroup=0-12');
    expect(url).toContain('maxDistance=5');
    expect(url).toContain('city=Yerevan');
  });

  it('clearing a sheet-owned filter actually removes its own param from the URL (merge still deletes what it owns)', async () => {
    const { component, router } = await navigateToListings(
      '/listings?ageGroup=0-12&maxDistance=5&city=Yerevan&categoryId=abc',
    );

    component.openSheet();
    component.clearSheet();
    await vi.advanceTimersByTimeAsync(350);

    const url = router.url;
    // Sheet-owned filters actually cleared out of the URL...
    expect(url).not.toContain('city=');
    expect(url).not.toContain('categoryId=');
    // ...while filters the sheet doesn't know about survive untouched.
    expect(url).toContain('ageGroup=0-12');
    expect(url).toContain('maxDistance=5');
  });
});
