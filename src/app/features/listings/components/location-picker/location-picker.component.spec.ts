import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { GeolocationService } from '../../../../shared/services/geolocation.service';
import { LocationPickerComponent, YEREVAN_CENTER } from './location-picker.component';
import type { MapLatLng } from '../../../../shared/ui/map/map.component';

/**
 * `app-map` (used inside this component's template) dynamic-imports the real
 * `leaflet` package. These tests care about the picker's OWN logic — resetting
 * the crosshair start point on open, confirm/cancel wiring, Escape/close
 * mapping — not Leaflet's rendering (covered by `map.component.spec.ts`), so
 * `leaflet` is stubbed out here too, keeping the dynamic import harmless.
 */
vi.mock('leaflet', () => ({
  map: vi.fn((_el: HTMLElement, options: { center: [number, number] }) => ({
    setView: vi.fn(),
    on: vi.fn(),
    getCenter: vi.fn(() => ({ lat: options.center[0], lng: options.center[1] })),
    invalidateSize: vi.fn(),
    removeLayer: vi.fn(),
    remove: vi.fn(),
  })),
  tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
  marker: vi.fn(() => ({ addTo: vi.fn() })),
  divIcon: vi.fn((options: unknown) => options),
}));

/** Narrow accessor for the protected members under test. */
interface Testable {
  currentCenter(): MapLatLng;
  hasMoved(): boolean;
  mapCenter(): MapLatLng;
  previewDiameterPx(): number | null;
  onCenterChange(center: MapLatLng): void;
  onVisibleChange(visible: boolean): void;
  requestMyLocation(): void;
  confirm(): void;
  cancel(): void;
}

async function createPicker(
  open: boolean,
  initialCenter?: MapLatLng,
  extraInputs?: Record<string, unknown>,
) {
  const geolocation = { getCurrentPosition: vi.fn() };
  TestBed.configureTestingModule({
    imports: [LocationPickerComponent, TranslateModule.forRoot()],
    providers: [{ provide: GeolocationService, useValue: geolocation }],
  });
  const fixture = TestBed.createComponent(LocationPickerComponent);
  fixture.componentRef.setInput('open', open);
  if (initialCenter) fixture.componentRef.setInput('initialCenter', initialCenter);
  if (extraInputs) {
    for (const [key, value] of Object.entries(extraInputs)) {
      fixture.componentRef.setInput(key, value);
    }
  }
  fixture.detectChanges();
  await vi.runAllTimersAsync();
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance as unknown as Testable,
    geolocation,
  };
}

describe('LocationPickerComponent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts the crosshair on the Yerevan default when no pin was picked before', async () => {
    const { component } = await createPicker(true);
    expect(component.currentCenter()).toEqual(YEREVAN_CENTER);
  });

  it('starts the crosshair on the already-picked pin when re-opening', async () => {
    const previouslyPicked: MapLatLng = { lat: 40.19, lng: 44.51 };
    const { component } = await createPicker(true, previouslyPicked);
    expect(component.currentCenter()).toEqual(previouslyPicked);
  });

  it('confirms with the current centre when the owner never pans the map', async () => {
    const { component } = await createPicker(true, YEREVAN_CENTER);
    let emitted: MapLatLng | null = null;
    (component as unknown as LocationPickerComponent).confirmed.subscribe((c) => (emitted = c));

    component.confirm();

    expect(emitted).toEqual(YEREVAN_CENTER);
  });

  it('confirms with the panned-to coordinate after the map settles elsewhere', async () => {
    const { component } = await createPicker(true, YEREVAN_CENTER);
    let emitted: MapLatLng | null = null;
    (component as unknown as LocationPickerComponent).confirmed.subscribe((c) => (emitted = c));

    const panned: MapLatLng = { lat: 40.21, lng: 44.48 };
    component.onCenterChange(panned);
    component.confirm();

    expect(emitted).toEqual(panned);
  });

  it('emits cancelled when the Cancel button is activated', async () => {
    const { component } = await createPicker(true);
    let cancelledCount = 0;
    (component as unknown as LocationPickerComponent).cancelled.subscribe(() => cancelledCount++);

    component.cancel();

    expect(cancelledCount).toBe(1);
  });

  it('treats the dialog closing itself (Escape / header close button) as a cancel', async () => {
    const { component } = await createPicker(true);
    let cancelledCount = 0;
    (component as unknown as LocationPickerComponent).cancelled.subscribe(() => cancelledCount++);

    // PrimeNG's p-dialog emits `visibleChange(false)` for Escape and the header
    // close button alike — the picker maps both to the same cancel path.
    component.onVisibleChange(false);

    expect(cancelledCount).toBe(1);
  });

  it('resets the crosshair to the NEW initial centre each time the picker re-opens', async () => {
    const first: MapLatLng = { lat: 40.1, lng: 44.4 };
    const second: MapLatLng = { lat: 40.3, lng: 44.6 };

    const { fixture, component } = await createPicker(true, first);
    expect(component.currentCenter()).toEqual(first);

    fixture.componentRef.setInput('open', false);
    fixture.componentRef.setInput('initialCenter', second);
    fixture.detectChanges();

    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    expect(component.currentCenter()).toEqual(second);
  });

  describe('confirmDisabledUntilMoved / hasMoved (screen 5 — reference-point picker)', () => {
    it('has NOT moved yet right after opening — the crosshair mode\'s own "report the starting centre" emission is not a real pan', async () => {
      const { component } = await createPicker(true, YEREVAN_CENTER);
      expect(component.hasMoved()).toBe(false);
    });

    it('becomes "moved" after a SECOND centre report — the first ever report (real or, here, simulated) never counts as a pan', async () => {
      const { component } = await createPicker(true, YEREVAN_CENTER);
      expect(component.hasMoved()).toBe(false);

      // This spec's mocked `leaflet.map()` never reaches `MapComponent`'s own
      // crosshair "report the starting centre" call (its mocked `tileLayer()`
      // doesn't return a real layer, so `init()` throws before getting there
      // and falls back to `mapError` — a limitation of this lightweight mock,
      // not of the real map). So the FIRST `onCenterChange` call here plays
      // the part that real Leaflet's own initial report would in production;
      // it must not count as a pan either way — only the second call should.
      component.onCenterChange(YEREVAN_CENTER);
      expect(component.hasMoved()).toBe(false);

      component.onCenterChange({ lat: 40.2, lng: 44.49 });
      expect(component.hasMoved()).toBe(true);
    });

    it('disables the confirm button in the DOM until the map has moved, when confirmDisabledUntilMoved is set', async () => {
      const { fixture, component } = await createPicker(true, YEREVAN_CENTER, {
        confirmDisabledUntilMoved: true,
      });
      // `p-dialog` portals its content to `document.body` (`appendTo="body"`),
      // NOT `fixture.nativeElement` — same reasoning as `auth-dialog`'s own
      // dialog usage elsewhere in this codebase.
      const confirmBtn = () =>
        document.body.querySelector<HTMLButtonElement>('.location-picker__btn--confirm');

      expect(confirmBtn()?.disabled).toBe(true);

      // Two reports needed in THIS spec's mock — see the previous test's
      // comment for why the first one doesn't count as a pan.
      component.onCenterChange(YEREVAN_CENTER);
      component.onCenterChange({ lat: 40.2, lng: 44.49 });
      fixture.detectChanges();

      expect(confirmBtn()?.disabled).toBe(false);
    });

    it('never disables the confirm button when confirmDisabledUntilMoved is left at its default (the wizard\'s own behaviour, unaffected)', async () => {
      await createPicker(true, YEREVAN_CENTER);
      const confirmBtn = document.body.querySelector<HTMLButtonElement>(
        '.location-picker__btn--confirm',
      );
      expect(confirmBtn?.disabled).toBe(false);
    });
  });

  describe('showMyLocationButton / requestMyLocation', () => {
    it('recentres the map once geolocation resolves', async () => {
      const { component, geolocation } = await createPicker(true, YEREVAN_CENTER, {
        showMyLocationButton: true,
      });
      geolocation.getCurrentPosition.mockResolvedValue({ lat: 40.25, lng: 44.55 });

      component.requestMyLocation();
      await Promise.resolve();

      expect(component.mapCenter()).toEqual({ lat: 40.25, lng: 44.55 });
    });

    it('leaves the crosshair where it was if geolocation fails — a convenience shortcut, not a hard requirement', async () => {
      const { component, geolocation } = await createPicker(true, YEREVAN_CENTER, {
        showMyLocationButton: true,
      });
      geolocation.getCurrentPosition.mockRejectedValue(new Error('denied'));

      component.requestMyLocation();
      await Promise.resolve();

      expect(component.mapCenter()).toEqual(YEREVAN_CENTER);
    });
  });

  describe('radiusPreviewMeters (dashed preview circle)', () => {
    it('renders no preview diameter when radiusPreviewMeters is null (default)', async () => {
      const { component } = await createPicker(true, YEREVAN_CENTER);
      expect(component.previewDiameterPx()).toBeNull();
    });

    it('computes a positive pixel diameter once a radius is supplied', async () => {
      const { component } = await createPicker(true, YEREVAN_CENTER, {
        radiusPreviewMeters: 2000,
      });
      const diameter = component.previewDiameterPx();
      expect(diameter).not.toBeNull();
      expect(diameter as number).toBeGreaterThan(0);
    });

    it('grows the on-screen diameter for a larger radius at the same zoom', async () => {
      const { fixture, component } = await createPicker(true, YEREVAN_CENTER, {
        radiusPreviewMeters: 500,
      });
      const smallDiameter = component.previewDiameterPx() as number;

      fixture.componentRef.setInput('radiusPreviewMeters', 5000);
      fixture.detectChanges();
      const largeDiameter = component.previewDiameterPx() as number;

      expect(largeDiameter).toBeGreaterThan(smallDiameter);
    });
  });
});
