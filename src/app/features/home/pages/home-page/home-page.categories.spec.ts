import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { selectIsAuthenticated } from '../../../auth/store/auth.selectors';
import { selectFavoriteIds } from '../../../favorites/store/favorites.selectors';
import type { ListingCategoryOption } from '../../../listings/models/create-listing.model';
import {
  selectListingCategories,
  selectListingCategoriesLoading,
} from '../../../listings/store/listings.selectors';
import { MyListingsApiService } from '../../../my-listings/services/my-listings-api.service';
import {
  selectHomeNearby,
  selectHomeSections,
  selectHomeSectionsError,
  selectHomeSectionsLoading,
} from '../../store/home.selectors';
import { initialHomeNearbyState } from '../../store/home.state';
import { CategoryTileComponent } from '../../components/category-tile/category-tile.component';
import {
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_CATEGORY_ICON,
} from '../../../../shared/utils/category-palette.model';
import { HomePageComponent } from './home-page.component';

/**
 * Same minimal leaflet stub as `home-page.mobile-search.spec.ts` — these
 * assertions are all about the category tiles, not the hero map, but Home
 * still mounts `app-home-hero-map` -> `app-map` on init.
 */
vi.mock('leaflet', () => ({
  map: vi.fn(() => ({
    setView: vi.fn(),
    on: vi.fn(),
    getCenter: vi.fn(() => ({ lat: 40.1776, lng: 44.5126 })),
    getZoom: vi.fn(() => 14),
    getBounds: vi.fn(() => ({
      getNorth: () => 40.2,
      getSouth: () => 40.1,
      getEast: () => 44.6,
      getWest: () => 44.5,
    })),
    invalidateSize: vi.fn(),
    removeLayer: vi.fn(),
    remove: vi.fn(),
  })),
  tileLayer: vi.fn(() => ({ addTo: vi.fn(), on: vi.fn() })),
  marker: vi.fn(() => ({ addTo: vi.fn(), getElement: vi.fn(() => null) })),
  circle: vi.fn(() => ({ addTo: vi.fn(), on: vi.fn() })),
  divIcon: vi.fn((options: unknown) => options),
}));

function createFixture(categories: ListingCategoryOption[]) {
  TestBed.configureTestingModule({
    imports: [HomePageComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      provideMockStore({
        selectors: [
          { selector: selectListingCategories, value: categories },
          { selector: selectListingCategoriesLoading, value: false },
          { selector: selectIsAuthenticated, value: false },
          { selector: selectHomeSections, value: [] },
          { selector: selectHomeSectionsLoading, value: false },
          { selector: selectHomeSectionsError, value: null },
          { selector: selectFavoriteIds, value: new Set<string>() },
          { selector: selectHomeNearby, value: initialHomeNearbyState },
        ],
      }),
      { provide: MyListingsApiService, useValue: { getMyListings: () => of([]) } },
    ],
  });

  const fixture = TestBed.createComponent(HomePageComponent);
  fixture.detectChanges();

  return fixture;
}

function tileVm(fixture: ReturnType<typeof createFixture>, index = 0) {
  const tiles = fixture.debugElement.queryAll(By.directive(CategoryTileComponent));
  return (tiles[index].componentInstance as CategoryTileComponent).category();
}

describe('HomePageComponent category tile mapping', () => {
  it('carries the admin-picked icon and colour through to the tile', () => {
    const fixture = createFixture([
      { id: 'cat-1', name: 'Ride-ons', slug: 'ride-ons', iconName: 'truck', colorHex: '#D9E8FF' },
    ]);

    const vm = tileVm(fixture);
    expect(vm.iconName).toBe('truck');
    expect(vm.colorHex).toBe('#D9E8FF');
  });

  it('falls back to the default icon when iconName is null', () => {
    const fixture = createFixture([
      { id: 'cat-1', name: 'Ride-ons', slug: 'ride-ons', iconName: null, colorHex: '#D9E8FF' },
    ]);

    expect(tileVm(fixture).iconName).toBe(DEFAULT_CATEGORY_ICON);
  });

  it('falls back to the default colour when colorHex is null', () => {
    const fixture = createFixture([
      { id: 'cat-1', name: 'Ride-ons', slug: 'ride-ons', iconName: 'truck', colorHex: null },
    ]);

    expect(tileVm(fixture).colorHex).toBe(DEFAULT_CATEGORY_COLOR);
  });

  it('no longer references imageUrl on the tile view model', () => {
    const fixture = createFixture([
      {
        id: 'cat-1',
        name: 'Ride-ons',
        slug: 'ride-ons',
        iconName: 'truck',
        colorHex: '#D9E8FF',
        imageUrl: '/assets/categories/ride-ons.svg',
      },
    ]);

    expect((tileVm(fixture) as unknown as { imageUrl?: unknown }).imageUrl).toBeUndefined();
  });
});
