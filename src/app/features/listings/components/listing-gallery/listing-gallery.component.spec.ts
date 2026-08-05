import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { ListingGalleryComponent } from './listing-gallery.component';
import type { ListingImage } from '../../models/listing.model';

/** Access to the component's protected surface without loosening it for production code. */
interface GalleryAccess {
  readonly sortedImages: () => ListingImage[];
  readonly mainImage: () => ListingImage | null;
  readonly hasMultipleImages: () => boolean;
  readonly mosaicMain: () => ListingImage | null;
  readonly mosaicSatellites: () => ListingImage[];
  readonly totalCount: () => number;
  readonly activeIndex: () => number;
  readonly lightboxOpen: () => boolean;
  readonly lightboxIndex: () => number;
  selectIndex(index: number): void;
  goPrev(): void;
  goNext(): void;
  openLightbox(index: number): void;
  closeLightbox(): void;
  lightboxPrev(): void;
  lightboxNext(): void;
  onWindowKeydown(event: KeyboardEvent): void;
}

function image(id: string, sortOrder: number, isPrimary = false): ListingImage {
  return { id, url: `https://example.test/${id}.jpg`, isPrimary, sortOrder };
}

async function createFixture(
  images: ListingImage[],
): Promise<{ fixture: ComponentFixture<ListingGalleryComponent>; component: GalleryAccess }> {
  await TestBed.configureTestingModule({
    imports: [ListingGalleryComponent, TranslateModule.forRoot()],
  }).compileComponents();

  const fixture = TestBed.createComponent(ListingGalleryComponent);
  fixture.componentRef.setInput('images', images);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance as unknown as GalleryAccess };
}

describe('ListingGalleryComponent', () => {
  it('sorts images by sortOrder regardless of input order', async () => {
    const { component } = await createFixture([image('c', 2), image('a', 0), image('b', 1)]);
    expect(component.sortedImages().map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('renders the empty state with zero images', async () => {
    const { component } = await createFixture([]);
    expect(component.totalCount()).toBe(0);
    expect(component.mainImage()).toBeNull();
    expect(component.mosaicMain()).toBeNull();
    expect(component.mosaicSatellites()).toEqual([]);
  });

  it('has no satellites and is not "multiple" with a single image', async () => {
    const { component } = await createFixture([image('a', 0)]);
    expect(component.totalCount()).toBe(1);
    expect(component.hasMultipleImages()).toBe(false);
    expect(component.mosaicMain()?.id).toBe('a');
    expect(component.mosaicSatellites()).toEqual([]);
  });

  it('caps the mosaic to 1 main + 4 satellites even with more photos', async () => {
    const images = Array.from({ length: 8 }, (_, i) => image(`img${i}`, i));
    const { component } = await createFixture(images);
    expect(component.totalCount()).toBe(8);
    expect(component.mosaicMain()?.id).toBe('img0');
    expect(component.mosaicSatellites().map((i) => i.id)).toEqual([
      'img1',
      'img2',
      'img3',
      'img4',
    ]);
  });

  it('wraps forward and backward through the mobile hero via selectIndex/goNext/goPrev', async () => {
    const { component } = await createFixture([image('a', 0), image('b', 1), image('c', 2)]);
    expect(component.activeIndex()).toBe(0);

    component.goPrev();
    expect(component.activeIndex()).toBe(2); // wraps to the last image

    component.goNext();
    expect(component.activeIndex()).toBe(0); // wraps back to the first

    component.selectIndex(5); // out-of-range index wraps via modulo
    expect(component.activeIndex()).toBe(2);
  });

  it('does nothing when selecting an index with no images', async () => {
    const { component } = await createFixture([]);
    component.selectIndex(0);
    expect(component.activeIndex()).toBe(0);
  });

  describe('lightbox', () => {
    it('opens at the requested index and closes', async () => {
      const { component } = await createFixture([image('a', 0), image('b', 1)]);
      expect(component.lightboxOpen()).toBe(false);

      component.openLightbox(1);
      expect(component.lightboxOpen()).toBe(true);
      expect(component.lightboxIndex()).toBe(1);

      component.closeLightbox();
      expect(component.lightboxOpen()).toBe(false);
    });

    it('navigates prev/next with wraparound independently of the mobile hero index', async () => {
      const { component } = await createFixture([image('a', 0), image('b', 1), image('c', 2)]);
      component.openLightbox(0);

      component.lightboxPrev();
      expect(component.lightboxIndex()).toBe(2);

      component.lightboxNext();
      expect(component.lightboxIndex()).toBe(0);

      // The mobile hero's own index is untouched by lightbox navigation.
      expect(component.activeIndex()).toBe(0);
    });

    it('responds to arrow keys only while open', async () => {
      const { component } = await createFixture([image('a', 0), image('b', 1)]);

      const rightArrow = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      component.onWindowKeydown(rightArrow);
      expect(component.lightboxIndex()).toBe(0); // closed — ignored

      component.openLightbox(0);
      component.onWindowKeydown(rightArrow);
      expect(component.lightboxIndex()).toBe(1);

      const leftArrow = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
      component.onWindowKeydown(leftArrow);
      expect(component.lightboxIndex()).toBe(0);
    });

    it('resets lightbox and hero state when the images input changes', async () => {
      const { fixture, component } = await createFixture([image('a', 0), image('b', 1)]);
      component.selectIndex(1);
      component.openLightbox(1);
      expect(component.lightboxOpen()).toBe(true);

      fixture.componentRef.setInput('images', [image('x', 0)]);
      fixture.detectChanges();

      expect(component.activeIndex()).toBe(0);
      expect(component.lightboxOpen()).toBe(false);
      expect(component.lightboxIndex()).toBe(0);
    });
  });
});
