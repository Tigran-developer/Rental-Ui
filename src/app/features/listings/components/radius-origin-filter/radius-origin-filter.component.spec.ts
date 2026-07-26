import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';

import { GeolocationService } from '../../../../shared/services/geolocation.service';
import * as ListingsActions from '../../store/listings.actions';
import {
  selectListingsOriginCoords,
  selectListingsOriginDenied,
  selectListingsOriginSource,
} from '../../store/listings.selectors';
import { RadiusOriginFilterComponent, type RadiusOriginState } from './radius-origin-filter.component';

/**
 * `RadiusOriginFilterComponent` mounts `app-map` (for the "manual" origin's
 * mini preview) and `app-location-picker` (always present, just hidden via
 * `p-dialog`'s `[visible]`) — both eventually reach `MapComponent`, which
 * dynamic-imports the real `leaflet` package. These tests care about THIS
 * component's own state machine and dispatch, not Leaflet's rendering
 * (covered by `map.component.spec.ts`), so `leaflet` is stubbed the same way
 * `location-picker.component.spec.ts` already does.
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
  tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
  marker: vi.fn(() => ({ addTo: vi.fn() })),
  divIcon: vi.fn((options: unknown) => options),
}));

interface Testable {
  readonly originState: () => RadiusOriginState;
  readonly locked: () => boolean;
  readonly effectiveMeters: () => number;
  requestGeolocation(): void;
  onPickerConfirmed(center: { lat: number; lng: number }): void;
  readonly pickerOpen: () => boolean;
  openPicker(): void;
  selectPreset(meters: number): void;
}

async function createHarness(radiusMeters: number | null = null) {
  const geolocation = { getCurrentPosition: vi.fn() };

  TestBed.configureTestingModule({
    imports: [RadiusOriginFilterComponent, TranslateModule.forRoot()],
    providers: [
      provideMockStore({
        selectors: [
          { selector: selectListingsOriginCoords, value: null },
          { selector: selectListingsOriginSource, value: null },
          { selector: selectListingsOriginDenied, value: false },
        ],
      }),
      { provide: GeolocationService, useValue: geolocation },
    ],
  });

  const store = TestBed.inject(MockStore);
  vi.spyOn(store, 'dispatch');

  const fixture = TestBed.createComponent(RadiusOriginFilterComponent);
  fixture.componentRef.setInput('radiusMeters', radiusMeters);
  fixture.detectChanges();

  return {
    fixture,
    component: fixture.componentInstance as unknown as Testable,
    store,
    geolocation,
  };
}

describe('RadiusOriginFilterComponent', () => {
  it('starts in the "unset" state with the slider locked when no origin is cached', async () => {
    const { component } = await createHarness();
    expect(component.originState()).toBe('unset');
    expect(component.locked()).toBe(true);
  });

  it('renders the "denied" state when a geolocation request was previously refused', async () => {
    const { fixture, store } = await createHarness();
    store.overrideSelector(selectListingsOriginDenied, true);
    store.refreshState();
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as Testable;
    expect(component.originState()).toBe('denied');
    expect(component.locked()).toBe(true);
  });

  it('renders the "geo" state once an origin is cached with source "geo"', async () => {
    const { fixture, store } = await createHarness();
    store.overrideSelector(selectListingsOriginCoords, { lat: 40.18, lng: 44.51 });
    store.overrideSelector(selectListingsOriginSource, 'geo');
    store.refreshState();
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as Testable;
    expect(component.originState()).toBe('geo');
    expect(component.locked()).toBe(false);
  });

  it('renders the "manual" state once an origin is cached with source "manual"', async () => {
    const { fixture, store } = await createHarness();
    store.overrideSelector(selectListingsOriginCoords, { lat: 40.18, lng: 44.51 });
    store.overrideSelector(selectListingsOriginSource, 'manual');
    store.refreshState();
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as Testable;
    expect(component.originState()).toBe('manual');
    expect(component.locked()).toBe(false);
  });

  it('dispatches setOriginCoords with source "geo" when geolocation succeeds', async () => {
    const { component, store, geolocation } = await createHarness();
    geolocation.getCurrentPosition.mockResolvedValue({ lat: 40.2, lng: 44.5 });

    component.requestGeolocation();
    await Promise.resolve();
    await Promise.resolve();

    expect(store.dispatch).toHaveBeenCalledWith(
      ListingsActions.setOriginCoords({ coords: { lat: 40.2, lng: 44.5 }, source: 'geo' }),
    );
  });

  it('dispatches setOriginDenied when geolocation fails — a soft state, never a thrown error, and no toast (design decision #5: the denied card is the only feedback)', async () => {
    const { fixture, component, store, geolocation } = await createHarness();
    geolocation.getCurrentPosition.mockRejectedValue(new Error('denied'));

    component.requestGeolocation();
    await Promise.resolve();
    await Promise.resolve();

    expect(store.dispatch).toHaveBeenCalledWith(ListingsActions.setOriginDenied());

    // The dispatch above is what a real reducer turns into `originDenied`;
    // simulate that round-trip here so this test proves the denial actually
    // reaches the UI (the "denied" card), not just that an action was fired
    // into the void.
    store.overrideSelector(selectListingsOriginDenied, true);
    store.refreshState();
    fixture.detectChanges();
    expect(component.originState()).toBe('denied');
  });

  it('dispatches setOriginCoords with source "manual" when the location picker confirms a point', async () => {
    const { component, store } = await createHarness();

    component.openPicker();
    expect(component.pickerOpen()).toBe(true);

    component.onPickerConfirmed({ lat: 40.19, lng: 44.52 });

    expect(store.dispatch).toHaveBeenCalledWith(
      ListingsActions.setOriginCoords({
        coords: { lat: 40.19, lng: 44.52 },
        source: 'manual',
      }),
    );
    expect(component.pickerOpen()).toBe(false);
  });

  it('auto-selects a default 1 km radius the moment an origin becomes available with no radius chosen yet', async () => {
    const { fixture, store } = await createHarness(null);
    let emitted: number | null = null;
    (fixture.componentInstance as unknown as RadiusOriginFilterComponent).radiusMetersChange.subscribe(
      (m) => (emitted = m),
    );

    store.overrideSelector(selectListingsOriginCoords, { lat: 40.18, lng: 44.51 });
    store.overrideSelector(selectListingsOriginSource, 'geo');
    store.refreshState();
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    expect(emitted).toBe(1000);
  });

  it('does NOT auto-select a default radius when a radius was already chosen', async () => {
    const { fixture, store } = await createHarness(3000);
    let emitted: number | null = null;
    (fixture.componentInstance as unknown as RadiusOriginFilterComponent).radiusMetersChange.subscribe(
      (m) => (emitted = m),
    );

    store.overrideSelector(selectListingsOriginCoords, { lat: 40.18, lng: 44.51 });
    store.overrideSelector(selectListingsOriginSource, 'geo');
    store.refreshState();
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    expect(emitted).toBeNull();
  });

  it('selecting a preset emits its metres value', async () => {
    const { component } = await createHarness(1000);
    let emitted: number | null = null;
    (component as unknown as RadiusOriginFilterComponent).radiusMetersChange.subscribe(
      (m) => (emitted = m),
    );

    component.selectPreset(3000);

    expect(emitted).toBe(3000);
  });
});
