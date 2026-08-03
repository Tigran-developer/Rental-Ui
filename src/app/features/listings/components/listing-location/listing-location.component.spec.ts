import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ListingLocationComponent } from './listing-location.component';
import { APPROXIMATE_AREA_RADIUS_METERS } from '../../models/approximate-area.const';
import type { ListingDistrict } from '../../models/district.model';
import type { ListingsFilter } from '../../models/listings-filter.model';
import { ListingLocationMapComponent } from '../listing-location-map/listing-location-map.component';
import { LocationPickerComponent } from '../location-picker/location-picker.component';
import { GeolocationService } from '../../../../shared/services/geolocation.service';
import type { GeolocatedPoint } from '../../../../shared/services/geolocation.service';
import { LanguageService } from '../../../../shared/services/language.service';
import type { GeoPoint } from '../../../../shared/utils/haversine-distance.utils';
import {
  selectListingsFilters,
  selectMapPins,
  selectMapPinsError,
  selectMapPinsLoading,
  selectMapPinsTruncated,
} from '../../store/listings.selectors';

/** `app-listings-map` (this component's map surfaces, Maps P2-2 reuse) owns
 *  the NgRx `loadMapPins`/`selectMapPins` plumbing — these selector values
 *  give it a stable, empty/idle default so this spec's own concerns
 *  (geolocation flow, fallback degradation, expand/collapse focus return)
 *  stay its focus. */
const BASE_FILTERS: ListingsFilter = {
  query: null,
  city: null,
  categoryId: null,
  minPrice: null,
  maxPrice: null,
  ageGroup: null,
  radiusKm: null,
  districtIds: [],
};

/**
 * `app-map` (mounted whenever the listing has coordinates, and again inside
 * both the expanded-map and manual-point-picker children once THEY open)
 * dynamic-imports the real `leaflet` package — stubbed here for the same
 * reason every other spec touching `app-map` stubs it: these tests care about
 * this component's OWN wiring (geolocation flow, fallback degradation,
 * expand/collapse focus return), not Leaflet's rendering.
 */
vi.mock('leaflet', () => ({
  map: vi.fn(() => ({
    setView: vi.fn(),
    on: vi.fn(),
    getCenter: vi.fn(() => ({ lat: 40.1776, lng: 44.5126 })),
    // `MapComponent.syncMarkerGroupCircles()` reads the LIVE zoom
    // unconditionally (this component always passes a non-null
    // `markerRadiusMeters`, even with an empty `markers()`) — omitting this
    // threw inside `init()`'s try/catch and was silently swallowed into
    // `mapError`, which is why every test below used to fail as "the whole
    // map card disappeared" rather than a visible thrown error.
    getZoom: vi.fn(() => 13),
    getBounds: vi.fn(() => ({
      getNorth: () => 41,
      getSouth: () => 39,
      getEast: () => 45,
      getWest: () => 44,
    })),
    latLngToContainerPoint: vi.fn(() => ({ x: 0, y: 0 })),
    invalidateSize: vi.fn(),
    removeLayer: vi.fn(),
    remove: vi.fn(),
    fitBounds: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    dragging: { enable: vi.fn(), disable: vi.fn(), enabled: vi.fn(() => false) },
    touchZoom: { enable: vi.fn(), disable: vi.fn(), enabled: vi.fn(() => false) },
  })),
  tileLayer: vi.fn(() => ({ addTo: vi.fn(() => ({ on: vi.fn() })), on: vi.fn() })),
  marker: vi.fn(() => ({ addTo: vi.fn(), getElement: vi.fn(() => null), setLatLng: vi.fn() })),
  circle: vi.fn(() => ({ addTo: vi.fn(), on: vi.fn() })),
  divIcon: vi.fn((options: unknown) => options),
  latLngBounds: vi.fn((points: unknown) => points),
}));

const district: ListingDistrict = {
  id: '11111111-1111-1111-1111-111111111111',
  code: 'kentron',
  nameEn: 'Kentron',
  nameHy: 'Կենտրոն',
  nameRu: 'Кентрон',
};

class FakeGeolocationService {
  nextResult: 'success' | 'failure' = 'success';
  // Good accuracy by default (well under LOW_ACCURACY_THRESHOLD_METERS) so
  // every pre-existing test that doesn't care about accuracy still sees the
  // plain "granted" distance line, not the low-accuracy soft block.
  nextPoint: GeolocatedPoint = { lat: 40.19, lng: 44.52, accuracyMeters: 20 };

  getCurrentPosition(): Promise<GeolocatedPoint> {
    return this.nextResult === 'success'
      ? Promise.resolve(this.nextPoint)
      : Promise.reject(new Error('denied'));
  }
}

async function createComponent(inputs: {
  city?: string;
  district?: ListingDistrict | null;
  latitude?: number | null;
  longitude?: number | null;
  title?: string;
  imageUrl?: string | null;
  /** Overrides `LanguageService.current()` — used to assert the distance
   *  line is locale-aware (`formatDistanceMeters`, `radius-scale.util.ts`)
   *  rather than the old hardcoded-`en-US` formatting this component used
   *  to do on its own. Defaults to whatever `LanguageService`'s real
   *  `resolveInitial()` picks (english in this jsdom test environment). */
  languageCode?: 'en' | 'hy' | 'ru';
}) {
  const fakeGeo = new FakeGeolocationService();
  const providers = [
    provideRouter([]),
    provideMockStore({
      selectors: [
        { selector: selectListingsFilters, value: BASE_FILTERS },
        { selector: selectMapPins, value: [] },
        { selector: selectMapPinsLoading, value: false },
        { selector: selectMapPinsError, value: null },
        { selector: selectMapPinsTruncated, value: false },
      ],
    }),
    { provide: GeolocationService, useValue: fakeGeo },
    ...(inputs.languageCode
      ? [
          {
            provide: LanguageService,
            useValue: {
              current: signal({
                code: inputs.languageCode,
                flag: '',
                native: '',
                label: '',
              }),
            },
          },
        ]
      : []),
  ];
  TestBed.configureTestingModule({
    imports: [ListingLocationComponent, TranslateModule.forRoot()],
    providers,
  });
  // Load just the interpolated strings this spec asserts on — the real
  // bundle (public/i18n/*.json) isn't wired into unit tests, so ngx-translate
  // would otherwise render the bare key for anything it doesn't recognise
  // (see conversation-details-page.component.spec.ts for the same pattern).
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation(
    'en',
    {
      listings: {
        details: {
          location: {
            approximateRadius: '~{{radius}} m',
            distanceFromYou: '≈ {{distance}} away',
            accuracyLabel: '± {{accuracy}}',
            lowAccuracyMessage: 'Your location looks approximate.',
          },
        },
        filters: {
          distance: {
            unitMeters: 'm',
            unitKilometers: 'km',
          },
        },
      },
    },
    true,
  );
  translate.use('en');
  const fixture = TestBed.createComponent(ListingLocationComponent);
  fixture.componentRef.setInput('listingId', 'L1');
  fixture.componentRef.setInput('city', inputs.city ?? 'Yerevan');
  fixture.componentRef.setInput('district', inputs.district ?? null);
  fixture.componentRef.setInput('latitude', inputs.latitude ?? null);
  fixture.componentRef.setInput('longitude', inputs.longitude ?? null);
  fixture.componentRef.setInput('title', inputs.title ?? 'LEGO Duplo Town');
  fixture.componentRef.setInput('imageUrl', inputs.imageUrl ?? null);
  fixture.detectChanges();
  await vi.runAllTimersAsync();
  fixture.detectChanges();
  // `fixture.nativeElement` is typed `any` — assigning it to a typed local
  // lets every call site use `el.querySelector<T>(...)` with a generic
  // instead of an `any`-typed generic call (TS2347 under this project's
  // strict compiler settings).
  const el: HTMLElement = fixture.nativeElement;
  return { fixture, el, fakeGeo };
}

describe('ListingLocationComponent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows only the district + city text, with no map affordance at all, when the listing has no coordinates', async () => {
    const { el } = await createComponent({ city: 'Yerevan', district, latitude: null, longitude: null });

    expect(el.textContent).toContain('Kentron');
    expect(el.textContent).toContain('Yerevan');
    expect(el.querySelector('.listing-location__map-card')).toBeNull();
    expect(el.querySelector('.listing-location__privacy-note')).toBeNull();
    expect(el.querySelector('.listing-location__fallback')).toBeNull();
    expect(el.querySelector('app-map')).toBeNull();
  });

  it('falls back to the city alone when no district resolved for the point', async () => {
    const { el } = await createComponent({ city: 'Yerevan', district: null, latitude: null, longitude: null });
    expect(el.textContent).toContain('Yerevan');
  });

  it('mounts an interactive, scroll-gated app-map immediately when coordinates are present', async () => {
    const { el } = await createComponent({ latitude: 40.18, longitude: 44.51 });

    expect(el.querySelector('app-map')).not.toBeNull();
    expect(el.querySelector('.listing-location__map-card')).not.toBeNull();
  });

  it('draws the circle at APPROXIMATE_AREA_RADIUS_METERS, which is never smaller than the geohash-7 worst-case uncertainty (~96.3m)', () => {
    const halfDiagonalWorstCase = Math.sqrt((117 / 2) ** 2 + (153 / 2) ** 2);
    expect(APPROXIMATE_AREA_RADIUS_METERS).toBeGreaterThanOrEqual(halfDiagonalWorstCase);
  });

  it('shows the two-line "approximate area / ~150 m" chip', async () => {
    const { el } = await createComponent({ latitude: 40.18, longitude: 44.51 });

    const chip = el.querySelector('.listing-location__chip');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain('150');
  });

  it('shows the privacy caption alongside the map', async () => {
    const { el } = await createComponent({ latitude: 40.18, longitude: 44.51 });
    const note = el.querySelector('.listing-location__privacy-note');
    expect(note).not.toBeNull();
    expect(note?.textContent?.trim().length).toBeGreaterThan(0);
  });

  describe('"My location" flow', () => {
    it('starts idle with an enabled locate button', async () => {
      const { el } = await createComponent({ latitude: 40.18, longitude: 44.51 });
      const btn = el.querySelector<HTMLButtonElement>('.listing-location__locate-btn');
      expect(btn).not.toBeNull();
      expect(btn?.disabled).toBe(false);
      expect(el.querySelector('.listing-location__distance')).toBeNull();
      expect(el.querySelector('.listing-location__geo-denied')).toBeNull();
    });

    it('on success: shows a user pin + a distance line, and removes the locate button', async () => {
      const { fixture, el, fakeGeo } = await createComponent({ latitude: 40.18, longitude: 44.51 });
      fakeGeo.nextResult = 'success';
      fakeGeo.nextPoint = { lat: 40.19, lng: 44.52, accuracyMeters: 20 };

      el.querySelector<HTMLButtonElement>('.listing-location__locate-btn')?.click();
      await vi.runAllTimersAsync();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(el.querySelector('.listing-location__locate-btn')).toBeNull();
      const distance = el.querySelector('.listing-location__distance');
      expect(distance).not.toBeNull();
      expect(distance?.textContent?.trim().length).toBeGreaterThan(0);
    });

    describe('low-accuracy disclosure', () => {
      it('good accuracy (well under the threshold): shows an accuracy line, no low-accuracy warning block', async () => {
        const { fixture, el, fakeGeo } = await createComponent({
          latitude: 40.18,
          longitude: 44.51,
        });
        fakeGeo.nextResult = 'success';
        fakeGeo.nextPoint = { lat: 40.19, lng: 44.52, accuracyMeters: 30 };

        el.querySelector<HTMLButtonElement>('.listing-location__locate-btn')?.click();
        await vi.runAllTimersAsync();
        fixture.detectChanges();
        await fixture.whenStable();

        const distance = el.querySelector('.listing-location__distance');
        expect(distance?.textContent).toContain('±');
        expect(el.querySelector('.listing-location__geo-denied')).toBeNull();
      });

      it('low accuracy (over LOW_ACCURACY_THRESHOLD_METERS): still shows the distance line, plus a soft warning block with a manual-pick button', async () => {
        const { fixture, el, fakeGeo } = await createComponent({
          latitude: 40.18,
          longitude: 44.51,
        });
        fakeGeo.nextResult = 'success';
        fakeGeo.nextPoint = { lat: 40.19, lng: 44.52, accuracyMeters: 5000 };

        el.querySelector<HTMLButtonElement>('.listing-location__locate-btn')?.click();
        await vi.runAllTimersAsync();
        fixture.detectChanges();
        await fixture.whenStable();

        const distance = el.querySelector('.listing-location__distance');
        expect(distance).not.toBeNull();
        expect(distance?.textContent?.trim().length).toBeGreaterThan(0);
        const warning = el.querySelector('.listing-location__geo-denied');
        expect(warning).not.toBeNull();
        expect(el.querySelector('.listing-location__pick-btn')).not.toBeNull();
      });

      it('unknown accuracy (browser reported no confidence radius): also treated as low accuracy', async () => {
        const { fixture, el, fakeGeo } = await createComponent({
          latitude: 40.18,
          longitude: 44.51,
        });
        fakeGeo.nextResult = 'success';
        fakeGeo.nextPoint = { lat: 40.19, lng: 44.52, accuracyMeters: null };

        el.querySelector<HTMLButtonElement>('.listing-location__locate-btn')?.click();
        await vi.runAllTimersAsync();
        fixture.detectChanges();
        await fixture.whenStable();

        expect(el.querySelector('.listing-location__distance')).not.toBeNull();
        expect(el.querySelector('.listing-location__geo-denied')).not.toBeNull();
      });

      it('picking a manual point after a low-accuracy geo fix clears the warning block (a manual pick is exact by construction)', async () => {
        const { fixture, el, fakeGeo } = await createComponent({
          latitude: 40.18,
          longitude: 44.51,
        });
        fakeGeo.nextResult = 'success';
        fakeGeo.nextPoint = { lat: 40.19, lng: 44.52, accuracyMeters: 5000 };
        el.querySelector<HTMLButtonElement>('.listing-location__locate-btn')?.click();
        await vi.runAllTimersAsync();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(el.querySelector('.listing-location__geo-denied')).not.toBeNull();

        el.querySelector<HTMLButtonElement>('.listing-location__pick-btn')?.click();
        fixture.detectChanges();

        const picker = fixture.debugElement.query(By.directive(LocationPickerComponent));
        const picked: GeoPoint = { lat: 40.2, lng: 44.53 };
        (picker.componentInstance as LocationPickerComponent).confirmed.emit(picked);
        fixture.detectChanges();
        await fixture.whenStable();

        expect(el.querySelector('.listing-location__geo-denied')).toBeNull();
        expect(el.querySelector('.listing-location__distance')).not.toBeNull();
      });
    });

    // Same two points in both: ≈1.4 km apart, a fractional (non-whole) km
    // value so the decimal separator is actually present in the output —
    // asserts the distance line goes through the SAME locale-aware
    // formatter as the radius filter (`formatDistanceMeters`,
    // `radius-scale.util.ts`) instead of the hardcoded `en-US`-only
    // formatting this component used to do on its own.
    it('shows a period decimal separator in `en` ("1.4")', async () => {
      const { fixture, el, fakeGeo } = await createComponent({
        latitude: 40.18,
        longitude: 44.51,
        languageCode: 'en',
      });
      fakeGeo.nextResult = 'success';
      fakeGeo.nextPoint = { lat: 40.19, lng: 44.52, accuracyMeters: 20 };
      el.querySelector<HTMLButtonElement>('.listing-location__locate-btn')?.click();
      await vi.runAllTimersAsync();
      fixture.detectChanges();
      await fixture.whenStable();
      const distance = el.querySelector('.listing-location__distance')?.textContent ?? '';
      expect(distance).toContain('1.4');
      expect(distance).not.toContain('1,4');
    });

    it('shows a comma decimal separator in `ru` ("1,4") — locale-aware, matching `radius-scale.util.ts` and the approved design, never `en-US`', async () => {
      const { fixture, el, fakeGeo } = await createComponent({
        latitude: 40.18,
        longitude: 44.51,
        languageCode: 'ru',
      });
      fakeGeo.nextResult = 'success';
      fakeGeo.nextPoint = { lat: 40.19, lng: 44.52, accuracyMeters: 20 };
      el.querySelector<HTMLButtonElement>('.listing-location__locate-btn')?.click();
      await vi.runAllTimersAsync();
      fixture.detectChanges();
      await fixture.whenStable();
      const distance = el.querySelector('.listing-location__distance')?.textContent ?? '';
      expect(distance).toContain('1,4');
      expect(distance).not.toContain('1.4');
    });

    it('on failure: shows the soft (non-error) denied block with a "pick a point" button, never the raw button again', async () => {
      const { fixture, el, fakeGeo } = await createComponent({ latitude: 40.18, longitude: 44.51 });
      fakeGeo.nextResult = 'failure';

      el.querySelector<HTMLButtonElement>('.listing-location__locate-btn')?.click();
      await vi.runAllTimersAsync();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(el.querySelector('.listing-location__locate-btn')).toBeNull();
      expect(el.querySelector('.listing-location__geo-denied')).not.toBeNull();
      expect(el.querySelector('.listing-location__pick-btn')).not.toBeNull();
    });

    it('opens the manual point picker from the denied state, and confirming it counts as "granted" (shows the distance line)', async () => {
      const { fixture, el, fakeGeo } = await createComponent({ latitude: 40.18, longitude: 44.51 });
      fakeGeo.nextResult = 'failure';
      el.querySelector<HTMLButtonElement>('.listing-location__locate-btn')?.click();
      await vi.runAllTimersAsync();
      fixture.detectChanges();

      el.querySelector<HTMLButtonElement>('.listing-location__pick-btn')?.click();
      fixture.detectChanges();

      const picker = fixture.debugElement.query(By.directive(LocationPickerComponent));
      expect(picker).not.toBeNull();
      expect(picker.componentInstance.open()).toBe(true);

      const picked: GeoPoint = { lat: 40.2, lng: 44.53 };
      (picker.componentInstance as LocationPickerComponent).confirmed.emit(picked);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(el.querySelector('.listing-location__geo-denied')).toBeNull();
      expect(el.querySelector('.listing-location__distance')).not.toBeNull();
    });

    it('cancelling the manual picker closes it without changing the denied state', async () => {
      const { fixture, el, fakeGeo } = await createComponent({ latitude: 40.18, longitude: 44.51 });
      fakeGeo.nextResult = 'failure';
      el.querySelector<HTMLButtonElement>('.listing-location__locate-btn')?.click();
      await vi.runAllTimersAsync();
      fixture.detectChanges();

      el.querySelector<HTMLButtonElement>('.listing-location__pick-btn')?.click();
      fixture.detectChanges();

      const picker = fixture.debugElement.query(By.directive(LocationPickerComponent));
      (picker.componentInstance as LocationPickerComponent).cancelled.emit();
      fixture.detectChanges();

      expect(picker.componentInstance.open()).toBe(false);
      expect(el.querySelector('.listing-location__geo-denied')).not.toBeNull();
    });
  });

  it('degrades to the district/city text + a two-part fallback card when app-map reports an error, and disables the locate button', async () => {
    const { fixture, el } = await createComponent({ city: 'Yerevan', district, latitude: 40.18, longitude: 44.51 });
    expect(el.querySelector('app-map')).not.toBeNull();

    const mapDebugEl = fixture.debugElement.query(By.css('app-map'));
    mapDebugEl.triggerEventHandler('mapError', undefined);
    fixture.detectChanges();

    expect(el.querySelector('app-map')).toBeNull();
    expect(el.querySelector('.listing-location__map-card')).toBeNull();
    expect(el.querySelector('.listing-location__privacy-note')).toBeNull();
    const fallback = el.querySelector('.listing-location__fallback');
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent?.trim().length).toBeGreaterThan(0);
    // The district/city text is still there — never an empty result.
    expect(el.textContent).toContain('Kentron');
    expect(el.textContent).toContain('Yerevan');

    const locateBtn = el.querySelector<HTMLButtonElement>('.listing-location__locate-btn');
    expect(locateBtn).not.toBeNull();
    expect(locateBtn?.disabled).toBe(true);
  });

  describe('expand / full-screen map', () => {
    it('opens the full-screen map when the expand trigger is clicked', async () => {
      const { fixture, el } = await createComponent({ latitude: 40.18, longitude: 44.51 });
      const trigger = el.querySelector<HTMLButtonElement>('[app-map-actions]');
      expect(trigger).not.toBeNull();
      trigger?.click();
      fixture.detectChanges();

      const fullscreen = fixture.debugElement.query(By.directive(ListingLocationMapComponent));
      expect(fullscreen.componentInstance.open()).toBe(true);
    });

    it('returns focus to the expand trigger once the full-screen map closes (a11y — see M-fix for the wizard picker)', async () => {
      const { fixture, el } = await createComponent({ latitude: 40.18, longitude: 44.51 });
      const trigger = el.querySelector<HTMLButtonElement>('[app-map-actions]') as HTMLButtonElement;
      trigger.click();
      fixture.detectChanges();

      const fullscreen = fixture.debugElement.query(By.directive(ListingLocationMapComponent));
      (fullscreen.componentInstance as ListingLocationMapComponent).closed.emit();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fullscreen.componentInstance.open()).toBe(false);
      expect(document.activeElement).toBe(el.querySelector('[app-map-actions]'));
    });

    it("re-emitting (locateMe) from the full-screen map runs the SAME geolocation flow as the card's own button", async () => {
      const { fixture, el, fakeGeo } = await createComponent({ latitude: 40.18, longitude: 44.51 });
      fakeGeo.nextResult = 'success';
      fakeGeo.nextPoint = { lat: 40.2, lng: 44.5, accuracyMeters: 20 };

      const fullscreen = fixture.debugElement.query(By.directive(ListingLocationMapComponent));
      (fullscreen.componentInstance as ListingLocationMapComponent).locateMe.emit();
      await vi.runAllTimersAsync();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(el.querySelector('.listing-location__distance')).not.toBeNull();
    });
  });
});
