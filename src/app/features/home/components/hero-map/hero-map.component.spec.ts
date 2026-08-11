import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import type { MapLatLng, MapMarkerGroup } from '../../../../shared/ui/map/map.component';
import { deriveHeroMapZoom, HomeHeroMapComponent } from './hero-map.component';

/**
 * `app-home-hero-map` wraps `app-map`, which is itself the only file allowed
 * to import `leaflet` — mocking the module here follows the exact
 * `vi.mock('leaflet', …)` + `vi.hoisted()` pattern `map.component.spec.ts`
 * uses, trimmed to only the Leaflet surface this wrapper's usage actually
 * touches (no `crosshair`/`fitPins`/`pin`, so no `L.latLngBounds`).
 */
const state = vi.hoisted(() => ({
  circleCalls: [] as { coords: [number, number]; options: Record<string, unknown> }[],
  markerCalls: [] as { coords: [number, number]; options: Record<string, unknown> }[],
}));

function makeFakeMap() {
  return {
    setView: vi.fn(),
    on: vi.fn(),
    getCenter: vi.fn(() => ({ lat: 40.1776, lng: 44.5126 })),
    getZoom: vi.fn(() => 14),
    latLngToContainerPoint: vi.fn(() => ({ x: 0, y: 0 })),
    getBounds: vi.fn(() => ({
      getNorth: () => 40.2,
      getSouth: () => 40.1,
      getEast: () => 44.6,
      getWest: () => 44.5,
    })),
    invalidateSize: vi.fn(),
    removeLayer: vi.fn(),
    remove: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fitBounds: vi.fn(),
    dragging: { enable: vi.fn(), disable: vi.fn(), enabled: vi.fn(() => false) },
    touchZoom: { enable: vi.fn(), disable: vi.fn(), enabled: vi.fn(() => false) },
  };
}

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
);

vi.stubGlobal(
  'matchMedia',
  vi.fn(
    () =>
      ({
        matches: false,
        media: '',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => true),
        onchange: null,
      }) as unknown as MediaQueryList,
  ),
);

vi.mock('leaflet', () => ({
  default: {
    map: vi.fn(() => makeFakeMap()),
    tileLayer: vi.fn(() => {
      const layer = { addTo: vi.fn(() => layer), on: vi.fn(() => layer) };
      return layer;
    }),
    marker: vi.fn((coords: [number, number], options: Record<string, unknown>) => {
      state.markerCalls.push({ coords, options });
      const iconOptions = options['icon'] as Record<string, unknown> | undefined;
      let element: HTMLElement | null = null;
      if (iconOptions && typeof iconOptions['html'] === 'string') {
        element = document.createElement('div');
        element.className = String(iconOptions['className'] ?? '');
        element.innerHTML = iconOptions['html'] as string;
      }
      const fakeMarker = {
        addTo: vi.fn(() => fakeMarker),
        getElement: vi.fn(() => element),
        setLatLng: vi.fn(),
      };
      return fakeMarker;
    }),
    circle: vi.fn((coords: [number, number], options: Record<string, unknown>) => {
      state.circleCalls.push({ coords, options });
      const fakeCircle = { addTo: vi.fn(() => fakeCircle), on: vi.fn(() => fakeCircle) };
      return fakeCircle;
    }),
    divIcon: vi.fn((options: Record<string, unknown>) => ({ __divIcon: true, ...options })),
    latLngBounds: vi.fn(() => ({ __bounds: true })),
  },
}));

@Component({
  standalone: true,
  imports: [HomeHeroMapComponent],
  template: `
    <app-home-hero-map
      [center]="center"
      [userPin]="userPin"
      [userAccuracyMeters]="userAccuracyMeters"
      [radiusMeters]="radiusMeters"
      [markers]="markers"
      [nearbyCount]="nearbyCount"
      [locating]="locating"
      (requestMyArea)="requestMyAreaCount = requestMyAreaCount + 1"
    />
  `,
})
class HostComponent {
  center: MapLatLng = { lat: 40.1776, lng: 44.5126 };
  userPin: MapLatLng | null = null;
  userAccuracyMeters: number | null = null;
  radiusMeters: number | null = null;
  markers: MapMarkerGroup[] = [];
  nearbyCount: number | null = null;
  locating = false;
  requestMyAreaCount = 0;
}

async function createHost() {
  TestBed.configureTestingModule({ imports: [HostComponent, TranslateModule.forRoot()] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  await vi.runAllTimersAsync();
  fixture.detectChanges();
  return fixture;
}

describe('HomeHeroMapComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.circleCalls = [];
    state.markerCalls = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not render the "N toys nearby" pill while nearbyCount is null (the default) — no false "0" flash', async () => {
    const fixture = await createHost();
    expect(fixture.nativeElement.querySelector('.hero-map__pill')).toBeNull();
  });

  it('renders the pill once nearbyCount is a real number, including 0', async () => {
    TestBed.configureTestingModule({ imports: [HostComponent, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.nearbyCount = 0;
    fixture.detectChanges();
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.hero-map__pill')).not.toBeNull();
  });

  it('draws no radius circle when radiusMeters is left null (the default — geolocation denied/unknown)', async () => {
    await createHost();
    expect(state.circleCalls).toHaveLength(0);
  });

  it('draws the radius circle once radiusMeters is set', async () => {
    TestBed.configureTestingModule({ imports: [HostComponent, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.radiusMeters = 1200;
    fixture.detectChanges();
    await vi.runAllTimersAsync();

    expect(state.circleCalls).toHaveLength(1);
    expect(state.circleCalls[0].options['radius']).toBe(1200);
  });

  it('renders marker dots as non-focusable (never a tab stop) — the frozen map must not trap keyboard focus', async () => {
    TestBed.configureTestingModule({ imports: [HostComponent, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.markers = [
      { key: '40.180000,44.510000', position: { lat: 40.18, lng: 44.51 }, count: 1 },
      { key: '40.190000,44.520000', position: { lat: 40.19, lng: 44.52 }, count: 3 },
    ];
    fixture.detectChanges();
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[tabindex="0"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="button"]')).toBeNull();
  });

  describe('opt-in geolocation control', () => {
    it('renders the button while ungranted (userPin null, the default) with a translated accessible name', async () => {
      const fixture = await createHost();
      const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('.app-map__btn');
      expect(button).not.toBeNull();
      expect(button!.getAttribute('aria-label')).toBe('home.heroMap.showMyArea');
    });

    it('hides the button once granted (userPin set) — nothing left to opt into', async () => {
      TestBed.configureTestingModule({ imports: [HostComponent, TranslateModule.forRoot()] });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.userPin = { lat: 40.2, lng: 44.55 };
      fixture.detectChanges();
      await vi.runAllTimersAsync();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.app-map__btn')).toBeNull();
    });

    it('emits requestMyArea when clicked', async () => {
      const fixture = await createHost();
      const button: HTMLButtonElement = fixture.nativeElement.querySelector('.app-map__btn');

      button.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.requestMyAreaCount).toBe(1);
    });

    it('disables the button while locating is true, so a visitor cannot double-dispatch the permission prompt', async () => {
      TestBed.configureTestingModule({ imports: [HostComponent, TranslateModule.forRoot()] });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.locating = true;
      fixture.detectChanges();
      await vi.runAllTimersAsync();
      fixture.detectChanges();

      const button: HTMLButtonElement = fixture.nativeElement.querySelector('.app-map__btn');
      expect(button.disabled).toBe(true);
    });

    it('is the only app-added tab stop — a real <button>, no explicit role/tabindex needed', async () => {
      const fixture = await createHost();
      const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('.app-map__btn');
      expect(button).not.toBeNull();
      expect(button!.tagName).toBe('BUTTON');
      expect(button!.hasAttribute('tabindex')).toBe(false);
      expect(button!.hasAttribute('role')).toBe(false);
    });
  });

  describe('pill i18n key — the two branches must never share one string', () => {
    it('renders through the cityCount key while ungranted (userPin null, the default)', async () => {
      TestBed.configureTestingModule({ imports: [HostComponent, TranslateModule.forRoot()] });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.nearbyCount = 5;
      fixture.detectChanges();
      await vi.runAllTimersAsync();
      fixture.detectChanges();

      const pill: HTMLElement = fixture.nativeElement.querySelector('.hero-map__pill');
      // No translation loaded (`TranslateModule.forRoot()` with no
      // translations) — ngx-translate falls back to the raw key, which is
      // exactly what lets this test assert WHICH key rendered.
      expect(pill.textContent).toContain('home.heroMap.cityCount');
      expect(pill.textContent).not.toContain('home.heroMap.nearbyCount');
    });

    it('renders through the nearbyCount key once granted (userPin set)', async () => {
      TestBed.configureTestingModule({ imports: [HostComponent, TranslateModule.forRoot()] });
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.userPin = { lat: 40.2, lng: 44.55 };
      fixture.componentInstance.nearbyCount = 5;
      fixture.detectChanges();
      await vi.runAllTimersAsync();
      fixture.detectChanges();

      const pill: HTMLElement = fixture.nativeElement.querySelector('.hero-map__pill');
      expect(pill.textContent).toContain('home.heroMap.nearbyCount');
      expect(pill.textContent).not.toContain('home.heroMap.cityCount');
    });
  });
});

describe('deriveHeroMapZoom', () => {
  it('zooms out to 12 for a radius beyond 2200m', () => {
    expect(deriveHeroMapZoom(2500)).toBe(12);
  });

  it('uses 13 for a radius beyond 1400m but at or below 2200m', () => {
    expect(deriveHeroMapZoom(2000)).toBe(13);
    expect(deriveHeroMapZoom(1401)).toBe(13);
  });

  it('uses the closest-in zoom (14) at or below 1400m, including the default 1.2km radius', () => {
    expect(deriveHeroMapZoom(1200)).toBe(14);
    expect(deriveHeroMapZoom(1400)).toBe(14);
  });

  it('uses the closest-in zoom (14) when there is no radius at all (geolocation denied)', () => {
    expect(deriveHeroMapZoom(null)).toBe(14);
  });
});
