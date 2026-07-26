import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';

import { GeolocationService } from '../../../../shared/services/geolocation.service';
import { LocationPickerComponent, YEREVAN_CENTER } from './location-picker.component';
import { MapComponent } from '../../../../shared/ui/map/map.component';
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
  // Needed since `MapComponent`'s `syncCircle()` now runs in `crosshair` mode
  // too (this picker's `effectiveRadiusPreviewMeters`/`circleDashed` wiring
  // below) — without this, `L.circle(...)` would be `undefined` and throw,
  // which `map.component.ts`'s `init()` catch would swallow into a spurious
  // `mapError` for every test in this file, not just the radius-preview ones.
  circle: vi.fn(() => ({ addTo: vi.fn() })),
  divIcon: vi.fn((options: unknown) => options),
}));

/** Narrow accessor for the protected members under test. */
interface Testable {
  currentCenter(): MapLatLng;
  hasMoved(): boolean;
  mapCenter(): MapLatLng;
  effectiveRadiusPreviewMeters(): number | null;
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

  // Regression for the defect this replaced: the preview used to be a CSS
  // `div` sized once from the zoom the picker opened at (`previewDiameterPx`)
  // — it drifted from the actual search radius as soon as the visitor zoomed.
  // It's now `app-map`'s own real geographic `circleRadiusMeters` layer (see
  // `map.component.ts`'s `syncCircle()`), which Leaflet itself keeps at the
  // correct size through any zoom change — so this spec only needs to check
  // the WIRING (the right value reaches `app-map`, gated by `hasMoved()`
  // exactly like before), not any on-screen pixel math.
  describe('radiusPreviewMeters (dashed preview circle, now a real app-map geographic layer)', () => {
    function mapCircleRadiusMeters(fixture: ReturnType<typeof TestBed.createComponent>) {
      const mapDebugEl = fixture.debugElement.query(By.directive(MapComponent));
      return (mapDebugEl.componentInstance as MapComponent).circleRadiusMeters();
    }

    it('passes no circleRadiusMeters to app-map when radiusPreviewMeters is null (default)', async () => {
      const { fixture } = await createPicker(true, YEREVAN_CENTER);
      expect(mapCircleRadiusMeters(fixture)).toBeNull();
    });

    it('still withholds circleRadiusMeters from app-map when a radius IS supplied but the crosshair has not moved yet', async () => {
      const { fixture, component } = await createPicker(true, YEREVAN_CENTER, {
        radiusPreviewMeters: 2000,
      });
      expect(component.hasMoved()).toBe(false);
      expect(mapCircleRadiusMeters(fixture)).toBeNull();
    });

    it('passes the radius through to app-map, dashed, once the crosshair has moved', async () => {
      const { fixture, component } = await createPicker(true, YEREVAN_CENTER, {
        radiusPreviewMeters: 2000,
      });
      // Two reports needed in this spec's mock — see the `hasMoved` describe
      // block above for why the first never counts as a real pan.
      component.onCenterChange(YEREVAN_CENTER);
      component.onCenterChange({ lat: 40.2, lng: 44.49 });
      fixture.detectChanges();

      expect(component.hasMoved()).toBe(true);
      expect(mapCircleRadiusMeters(fixture)).toBe(2000);
      const mapDebugEl = fixture.debugElement.query(By.directive(MapComponent));
      expect((mapDebugEl.componentInstance as MapComponent).circleDashed()).toBe(true);
    });

    it('updates the radius app-map receives when radiusPreviewMeters changes (post-move)', async () => {
      const { fixture, component } = await createPicker(true, YEREVAN_CENTER, {
        radiusPreviewMeters: 500,
      });
      component.onCenterChange(YEREVAN_CENTER);
      component.onCenterChange({ lat: 40.2, lng: 44.49 });
      fixture.detectChanges();
      expect(mapCircleRadiusMeters(fixture)).toBe(500);

      fixture.componentRef.setInput('radiusPreviewMeters', 5000);
      fixture.detectChanges();

      expect(mapCircleRadiusMeters(fixture)).toBe(5000);
    });
  });

  // Regression for a confirmed live-verification defect: the hint card used
  // to be ONE element (`.location-picker__hint`) that was both the visible
  // white card AND its own `left:14/right:14` positioning box, so its
  // background stretched edge-to-edge across the map on desktop widths —
  // physically covering app-map's top-right zoom stack (z-index 1002 vs.
  // this element's 1003), so neither a mouse click nor a touch tap could
  // reach the zoom buttons, and a `mousedown` anywhere in that top strip hit
  // the hint instead of starting a map drag.
  //
  // jsdom cannot lay out real pixel geometry (no bounding-box overlap check
  // is possible here — that part is only verifiable in a real browser; see
  // this PR's report), so this checks the two things jsdom *can* see and
  // that together fully describe the fix: (1) the hollow positioning box and
  // the visible card are now separate elements, not one merged node, and
  // (2) the stylesheet gives the hollow box `pointer-events: none` and the
  // visible card `pointer-events: auto` — the split that stops the
  // full-width box from swallowing clicks/drags meant for whatever is
  // beneath it, independent of z-index. A test that only checked for the
  // `.location-picker__hint` class's continued presence would have passed
  // on the original single-element, click-swallowing markup too — this one
  // fails on it, because that markup had no separate `.location-picker__
  // hint-card` element and no `pointer-events` split at all.
  describe('hint card must not intercept clicks/drags meant for the map (zoom-button overlap regression)', () => {
    it('renders the visible card as a NESTED element, separate from the full-width positioning box', async () => {
      await createPicker(true, YEREVAN_CENTER, { hintTitleKey: 'some.key' });
      const hintBox = document.body.querySelector('.location-picker__hint');
      const hintCard = document.body.querySelector('.location-picker__hint-card');

      expect(hintBox).toBeTruthy();
      expect(hintCard).toBeTruthy();
      // Must be two distinct elements, one containing the other — NOT the
      // same node wearing two classes (that would put the visible card's
      // own background back on the full-width box).
      expect(hintBox).not.toBe(hintCard);
      expect(hintBox?.contains(hintCard)).toBe(true);
    });

    it('gives the full-width positioning box pointer-events: none and the visible card pointer-events: auto', async () => {
      await createPicker(true, YEREVAN_CENTER, { hintTitleKey: 'some.key' });
      const hintBox = document.body.querySelector<HTMLElement>('.location-picker__hint');
      const hintCard = document.body.querySelector<HTMLElement>('.location-picker__hint-card');

      expect(hintBox).toBeTruthy();
      expect(hintCard).toBeTruthy();
      expect(getComputedStyle(hintBox as HTMLElement).pointerEvents).toBe('none');
      expect(getComputedStyle(hintCard as HTMLElement).pointerEvents).toBe('auto');
    });
  });
});
