import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { makeListingMapPin } from '../../../../../testing/fixtures';
import { ListingsMapPopupComponent } from './listings-map-popup.component';

async function createComponent(overrides: Parameters<typeof makeListingMapPin>[0] = {}) {
  TestBed.configureTestingModule({
    imports: [ListingsMapPopupComponent, TranslateModule.forRoot()],
    providers: [provideRouter([])],
  });

  // Only the strings this spec actually reads — the real bundle
  // (public/i18n/*.json) isn't wired into unit tests, see
  // listing-location.component.spec.ts for the same pattern.
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation(
    'en',
    {
      listings: {
        map: {
          popup: {
            viewButton: 'View toy',
            close: 'Close',
          },
        },
        createForm: {
          perUnit: {
            hourly: '/ hour',
            daily: '/ day',
            weekly: '/ week',
            monthly: '/ month',
            yearly: '/ year',
          },
        },
      },
      reviews: {
        summary: {
          ariaRating: '{{rating}} out of 5',
          noReviews: 'No reviews yet',
        },
      },
    },
    true,
  );
  translate.use('en');

  const fixture = TestBed.createComponent(ListingsMapPopupComponent);
  fixture.componentRef.setInput('pin', makeListingMapPin(overrides));
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement;
  return { fixture, el };
}

describe('ListingsMapPopupComponent', () => {
  it('renders the star rating with the (reviewCount) count when rating is present', async () => {
    const { el } = await createComponent({ rating: 4.6, reviewCount: 12 });

    const rating = el.querySelector('.listings-map-popup__rating');
    expect(rating).not.toBeNull();
    expect(rating!.classList.contains('listings-map-popup__rating--empty')).toBe(false);
    expect(rating!.querySelector('.listings-map-popup__rating-value')!.textContent).toContain('4.6');
    expect(rating!.querySelector('.listings-map-popup__rating-count')!.textContent).toContain('12');
  });

  it('renders the empty-rating fallback (same rule as the catalogue card: rating is null below reviewCount < 2)', async () => {
    const { el } = await createComponent({ rating: null, reviewCount: 0 });

    const rating = el.querySelector('.listings-map-popup__rating');
    expect(rating).not.toBeNull();
    expect(rating!.classList.contains('listings-map-popup__rating--empty')).toBe(true);
    expect(rating!.getAttribute('aria-label')).toBe('No reviews yet');
  });

  it('renders the no-image placeholder when primaryImageUrl is null, and never an <img>', async () => {
    const { el } = await createComponent({ primaryImageUrl: null });

    expect(el.querySelector('.listings-map-popup__img')).toBeNull();
    expect(el.querySelector('.listings-map-popup__no-image')).not.toBeNull();
  });

  it('renders the real photo when primaryImageUrl is set', async () => {
    const { el } = await createComponent({ primaryImageUrl: 'https://example.test/toy.jpg' });

    const img = el.querySelector<HTMLImageElement>('.listings-map-popup__img');
    expect(img).not.toBeNull();
    expect(img!.src).toBe('https://example.test/toy.jpg');
    expect(el.querySelector('.listings-map-popup__no-image')).toBeNull();
  });

  it('points the view button at /listings/:id', async () => {
    const { el } = await createComponent({ id: 'toy-42' });

    const link = el.querySelector<HTMLAnchorElement>('.listings-map-popup__view-btn');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('/listings/toy-42');
  });

  it('emits closeRequested when the close button is clicked', async () => {
    const { fixture, el } = await createComponent();
    let closed = false;
    fixture.componentInstance.closeRequested.subscribe(() => (closed = true));

    el.querySelector<HTMLButtonElement>('.listings-map-popup__close')!.click();

    expect(closed).toBe(true);
  });
});
