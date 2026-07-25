import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ListingLocationMapComponent } from './listing-location-map.component';
import type { MapLatLng } from '../../../../shared/ui/map/map.component';

/** Same reasoning as `listing-location.component.spec.ts` — these tests care
 *  about THIS component's own wiring (locate/close outputs, fallback
 *  degradation), not Leaflet's rendering. */
vi.mock('leaflet', () => ({
  map: vi.fn(() => ({
    setView: vi.fn(),
    on: vi.fn(),
    getCenter: vi.fn(() => ({ lat: 40.1776, lng: 44.5126 })),
    invalidateSize: vi.fn(),
    removeLayer: vi.fn(),
    remove: vi.fn(),
    fitBounds: vi.fn(),
  })),
  tileLayer: vi.fn(() => ({ addTo: vi.fn(() => ({ on: vi.fn() })), on: vi.fn() })),
  marker: vi.fn(() => ({ addTo: vi.fn() })),
  circle: vi.fn(() => ({ addTo: vi.fn() })),
  divIcon: vi.fn((options: unknown) => options),
  latLngBounds: vi.fn((points: unknown) => points),
}));

const CENTER: MapLatLng = { lat: 40.1776, lng: 44.5126 };

async function createComponent(inputs: {
  open?: boolean;
  userPin?: MapLatLng | null;
  distanceDisplay?: string | null;
  imageUrl?: string | null;
}) {
  TestBed.configureTestingModule({
    imports: [ListingLocationMapComponent, TranslateModule.forRoot()],
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
            distanceFromYou: '≈ {{distance}} away',
            mapUnavailableDescription: 'But the toy is in {{place}}.',
          },
        },
      },
    },
    true,
  );
  translate.use('en');
  const fixture = TestBed.createComponent(ListingLocationMapComponent);
  fixture.componentRef.setInput('open', inputs.open ?? true);
  fixture.componentRef.setInput('center', CENTER);
  fixture.componentRef.setInput('circleRadiusMeters', 150);
  fixture.componentRef.setInput('title', 'LEGO Duplo Town');
  fixture.componentRef.setInput('placeLabel', 'Kentron, Yerevan');
  fixture.componentRef.setInput('userPin', inputs.userPin ?? null);
  fixture.componentRef.setInput('distanceDisplay', inputs.distanceDisplay ?? null);
  fixture.componentRef.setInput('imageUrl', inputs.imageUrl ?? null);
  fixture.detectChanges();
  await vi.runAllTimersAsync();
  fixture.detectChanges();
  return fixture;
}

describe('ListingLocationMapComponent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // `p-dialog` portals its content to `document.body` (`appendTo="body"`),
  // NOT `fixture.nativeElement` — same reasoning as `auth-dialog`'s own
  // dialog usage and `location-picker.component.spec.ts` elsewhere in this
  // codebase. Every assertion below queries `document.body`, never the
  // fixture's own (effectively empty, post-portal) native element.

  it('renders the listing title, place, and a placeholder thumb when no imageUrl is given', async () => {
    await createComponent({});

    expect(document.body.textContent).toContain('LEGO Duplo Town');
    expect(document.body.textContent).toContain('Kentron, Yerevan');
    expect(document.body.querySelector('.listing-location-map__thumb--placeholder')).not.toBeNull();
    expect(document.body.querySelector('img.listing-location-map__thumb')).toBeNull();
  });

  it('renders the real thumbnail image when imageUrl is provided', async () => {
    await createComponent({ imageUrl: 'https://example.test/photo.jpg' });

    const img = document.body.querySelector<HTMLImageElement>('img.listing-location-map__thumb');
    expect(img).not.toBeNull();
    expect(img?.src).toBe('https://example.test/photo.jpg');
  });

  it('hides the distance line when distanceDisplay is not set', async () => {
    await createComponent({});
    expect(document.body.querySelector('.listing-location-map__plaque-distance')).toBeNull();
  });

  it('shows the distance line when distanceDisplay is set', async () => {
    await createComponent({ distanceDisplay: '2.4' });
    const distanceEl = document.body.querySelector('.listing-location-map__plaque-distance');
    expect(distanceEl).not.toBeNull();
    expect(distanceEl?.textContent).toContain('2.4');
  });

  it('emits closed when the close button is activated', async () => {
    const fixture = await createComponent({});
    let closedCount = 0;
    fixture.componentInstance.closed.subscribe(() => closedCount++);

    const closeBtn = document.body.querySelector<HTMLButtonElement>(
      '.listing-location-map__close-btn',
    );
    closeBtn?.click();

    expect(closedCount).toBe(1);
  });

  it('emits closed when the "back to listing" button is activated', async () => {
    const fixture = await createComponent({});
    let closedCount = 0;
    fixture.componentInstance.closed.subscribe(() => closedCount++);

    const backBtn = document.body.querySelector<HTMLButtonElement>(
      '.listing-location-map__back-btn',
    );
    backBtn?.click();

    expect(closedCount).toBe(1);
  });

  it('treats the dialog closing itself (Escape) as closed, same as the explicit buttons', async () => {
    const fixture = await createComponent({});
    let closedCount = 0;
    fixture.componentInstance.closed.subscribe(() => closedCount++);

    (fixture.componentInstance as unknown as { onVisibleChange(v: boolean): void }).onVisibleChange(
      false,
    );

    expect(closedCount).toBe(1);
  });

  it('emits locateMe (never calls geolocation itself) when the locate button is clicked', async () => {
    const fixture = await createComponent({});
    let locateCount = 0;
    fixture.componentInstance.locateMe.subscribe(() => locateCount++);

    const locateBtn = document.body.querySelector<HTMLButtonElement>(
      '.app-map__actions .app-map__btn',
    );
    locateBtn?.click();

    expect(locateCount).toBe(1);
  });

  it('degrades to a full-surface text fallback (and hides the plaque) when this map instance reports mapError', async () => {
    const fixture = await createComponent({});
    (fixture.componentInstance as unknown as { onMapError(): void }).onMapError();
    fixture.detectChanges();

    expect(document.body.querySelector('.listing-location-map__fallback')).not.toBeNull();
    expect(document.body.querySelector('.listing-location-map__plaque')).toBeNull();
    // The district/city and a way back to the listing are still available.
    expect(document.body.textContent).toContain('Kentron, Yerevan');
    expect(
      document.body.querySelector(
        '.listing-location-map__fallback .listing-location-map__back-btn',
      ),
    ).not.toBeNull();
  });
});
