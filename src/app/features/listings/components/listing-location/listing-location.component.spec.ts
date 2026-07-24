import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { ListingLocationComponent } from './listing-location.component';
import type { ListingDistrict } from '../../models/district.model';

/**
 * `app-map` (used inside this component's template whenever the listing has
 * coordinates) dynamic-imports the real `leaflet` package — stubbed here for
 * the same reason `location-picker.component.spec.ts` stubs it: these tests
 * care about this component's OWN wiring (the map mounting on load, fallback
 * text, error degradation), not Leaflet's rendering (covered by
 * `map.component.spec.ts`).
 */
vi.mock('leaflet', () => ({
  map: vi.fn(() => ({
    setView: vi.fn(),
    on: vi.fn(),
    getCenter: vi.fn(() => ({ lat: 40.1776, lng: 44.5126 })),
    invalidateSize: vi.fn(),
    removeLayer: vi.fn(),
    remove: vi.fn(),
  })),
  tileLayer: vi.fn(() => ({ addTo: vi.fn(() => ({ on: vi.fn() })), on: vi.fn() })),
  marker: vi.fn(() => ({ addTo: vi.fn() })),
  circle: vi.fn(() => ({ addTo: vi.fn() })),
  divIcon: vi.fn((options: unknown) => options),
}));

const district: ListingDistrict = {
  id: '11111111-1111-1111-1111-111111111111',
  code: 'kentron',
  nameEn: 'Kentron',
  nameHy: 'Կենտրոն',
  nameRu: 'Кентрон',
};

async function createComponent(inputs: {
  city?: string;
  district?: ListingDistrict | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  TestBed.configureTestingModule({
    imports: [ListingLocationComponent, TranslateModule.forRoot()],
  });
  const fixture = TestBed.createComponent(ListingLocationComponent);
  fixture.componentRef.setInput('city', inputs.city ?? 'Yerevan');
  fixture.componentRef.setInput('district', inputs.district ?? null);
  fixture.componentRef.setInput('latitude', inputs.latitude ?? null);
  fixture.componentRef.setInput('longitude', inputs.longitude ?? null);
  fixture.detectChanges();
  return fixture;
}

describe('ListingLocationComponent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows only the district + city text, with no map affordance at all, when the listing has no coordinates', async () => {
    const fixture = await createComponent({ city: 'Yerevan', district, latitude: null, longitude: null });
    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).toContain('Kentron');
    expect(el.textContent).toContain('Yerevan');
    expect(el.querySelector('.listing-location__map-card')).toBeNull();
    expect(el.querySelector('.listing-location__privacy-note')).toBeNull();
    expect(el.querySelector('.listing-location__unavailable')).toBeNull();
    expect(el.querySelector('app-map')).toBeNull();
  });

  it('falls back to the city alone when no district resolved for the point', async () => {
    const fixture = await createComponent({ city: 'Yerevan', district: null, latitude: null, longitude: null });
    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).toContain('Yerevan');
  });

  it('mounts app-map immediately when coordinates are present — no tap-to-load gate', async () => {
    const fixture = await createComponent({ latitude: 40.18, longitude: 44.51 });
    const el: HTMLElement = fixture.nativeElement;
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    expect(el.querySelector('app-map')).not.toBeNull();
    expect(el.querySelector('.listing-location__map-card')).not.toBeNull();
  });

  it('shows the floating "approximate area" chip and the privacy caption alongside the map', async () => {
    const fixture = await createComponent({ latitude: 40.18, longitude: 44.51 });
    const el: HTMLElement = fixture.nativeElement;
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    const chip = el.querySelector('.listing-location__chip');
    expect(chip).not.toBeNull();
    expect(chip?.textContent?.trim().length).toBeGreaterThan(0);

    // The full trilingual privacy promise ("only the general area is shown —
    // not the exact address") must still reach the reader now that the old
    // tap-to-load placeholder copy is gone — see ADR-008 / M-017.
    const note = el.querySelector('.listing-location__privacy-note');
    expect(note).not.toBeNull();
    expect(note?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('degrades to the district/city text + mapUnavailable line when app-map reports an error, and removes the map', async () => {
    const fixture = await createComponent({ city: 'Yerevan', district, latitude: 40.18, longitude: 44.51 });
    const el: HTMLElement = fixture.nativeElement;
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    expect(el.querySelector('app-map')).not.toBeNull();

    // Simulate app-map's (mapError) output firing.
    (fixture.componentInstance as unknown as { onMapError(): void }).onMapError();
    fixture.detectChanges();

    expect(el.querySelector('app-map')).toBeNull();
    expect(el.querySelector('.listing-location__map-card')).toBeNull();
    expect(el.querySelector('.listing-location__privacy-note')).toBeNull();
    const unavailable = el.querySelector('.listing-location__unavailable');
    expect(unavailable).not.toBeNull();
    expect(unavailable?.textContent?.trim().length).toBeGreaterThan(0);

    // The district/city text is still there — never an empty result.
    expect(el.textContent).toContain('Kentron');
    expect(el.textContent).toContain('Yerevan');
  });
});
