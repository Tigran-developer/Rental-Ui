import { TestBed } from '@angular/core/testing';

import {
  CategoryTileComponent,
  type HomeCategoryTileVm,
} from './category-tile.component';
import { DEFAULT_CATEGORY_COLOR } from '../../../../shared/utils/category-palette.model';

const CATEGORY: HomeCategoryTileVm = {
  id: 'cat-1',
  slug: 'outdoor',
  label: 'Outdoor Toys',
  iconName: 'sparkle',
  colorHex: '#3fd69b',
};

function createFixture(category: HomeCategoryTileVm = CATEGORY) {
  // Reset first: a couple of specs below create more than one fixture per
  // `it` (to diff two rendered backgrounds against each other), and TestBed
  // refuses a second `configureTestingModule` once it has instantiated.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [CategoryTileComponent] });

  const fixture = TestBed.createComponent(CategoryTileComponent);
  fixture.componentRef.setInput('category', category);
  fixture.detectChanges();

  return fixture;
}

describe('CategoryTileComponent overlay label', () => {
  it('renders the category name over the media', () => {
    const host: HTMLElement = createFixture().nativeElement;
    const overlay = host.querySelector('.category-tile__overlay-label');

    expect(overlay).not.toBeNull();
    expect(overlay!.textContent?.trim()).toBe('Outdoor Toys');
  });

  it('exposes exactly one accessible name — the button aria-label', () => {
    const host: HTMLElement = createFixture().nativeElement;

    expect(host.querySelector('.category-tile')!.getAttribute('aria-label')).toBe(
      'Outdoor Toys',
    );

    // Both visible labels are decorative: the overlay (desktop) and the chip
    // (mobile). Without this, a screen reader would announce the name twice.
    expect(
      host.querySelector('.category-tile__overlay-label')!.getAttribute('aria-hidden'),
    ).toBe('true');
    expect(host.querySelector('.category-tile__chip')!.getAttribute('aria-hidden')).toBe(
      'true',
    );
    // The icon itself must not add a second accessible name either — the
    // shared icon component always renders its svg aria-hidden.
    expect(host.querySelector('app-icon svg')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the chip in the DOM so the mobile (≤560px) label survives', () => {
    // Desktop hides the chip with `display: none` in CSS, not with @if — the
    // media query alone decides which of the two labels is visible.
    const host: HTMLElement = createFixture().nativeElement;
    const chip = host.querySelector('.category-tile__chip');

    expect(chip).not.toBeNull();
    expect(chip!.textContent?.trim()).toBe('Outdoor Toys');
  });
});

describe('CategoryTileComponent icon + colour', () => {
  it('renders the admin-picked icon via the shared icon component', () => {
    const host: HTMLElement = createFixture({
      ...CATEGORY,
      iconName: 'truck',
    }).nativeElement;

    // The shared icon component renders an <svg>, not a PrimeIcon <i> glyph.
    expect(host.querySelector('.category-tile__icon svg')).not.toBeNull();
    expect(host.querySelector('.category-tile__icon i')).toBeNull();
  });

  function mediaBackground(category: HomeCategoryTileVm): string {
    const host: HTMLElement = createFixture(category).nativeElement;
    return host.querySelector<HTMLElement>('.category-tile__media')!.style.background;
  }

  it('honours the admin-picked colour as the media background', () => {
    // Two distinct valid colours must render two distinct backgrounds — the
    // exact browser-normalized form of `style.background` isn't asserted,
    // just that the bound colour drives it.
    const blue = mediaBackground({ ...CATEGORY, colorHex: '#D9E8FF' });
    const peach = mediaBackground({ ...CATEGORY, colorHex: '#FFE6CC' });

    expect(blue.length).toBeGreaterThan(0);
    expect(blue).not.toBe(peach);
  });

  it('falls back to the default palette colour for a malformed colorHex', () => {
    const malformed = mediaBackground({ ...CATEGORY, colorHex: 'not-a-color' });
    const fallback = mediaBackground({ ...CATEGORY, colorHex: DEFAULT_CATEGORY_COLOR });

    expect(malformed).toBe(fallback);
  });

  it('falls back to the default palette colour for an empty colorHex', () => {
    const empty = mediaBackground({ ...CATEGORY, colorHex: '' });
    const fallback = mediaBackground({ ...CATEGORY, colorHex: DEFAULT_CATEGORY_COLOR });

    expect(empty).toBe(fallback);
  });

  it('accepts an 8-digit hex colour', () => {
    const eightDigit = mediaBackground({ ...CATEGORY, colorHex: '#D9E8FFCC' });
    const fallback = mediaBackground({ ...CATEGORY, colorHex: DEFAULT_CATEGORY_COLOR });

    expect(eightDigit).not.toBe(fallback);
  });
});
