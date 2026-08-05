import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  afterRenderEffect,
  computed,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DialogModule } from 'primeng/dialog';

import type { ListingImage } from '../../models/listing.model';

export type GalleryBadgeTone = 'success' | 'info';

/** Trust badge overlaid on the desktop mosaic's first tile — real data only. */
export interface GalleryBadge {
  readonly icon: string;
  readonly label: string;
  readonly tone: GalleryBadgeTone;
}

@Component({
  selector: 'app-listing-gallery',
  standalone: true,
  imports: [DialogModule, TranslatePipe],
  templateUrl: './listing-gallery.component.html',
  styleUrl: './listing-gallery.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingGalleryComponent {
  readonly images = input.required<ListingImage[]>();
  /** Desktop-only overlay badges on the mosaic's first tile (real signals only). */
  readonly badges = input<readonly GalleryBadge[]>([]);

  protected readonly activeIndex = signal(0);
  protected readonly lightboxOpen = signal(false);
  protected readonly lightboxIndex = signal(0);

  /** The lightbox `<p-dialog>`'s `[maskStyleClass]` (template) — also read by
   *  `onWindowMousedown()` below to recognise a click on the mask itself, as
   *  opposed to a click that started inside the dialog content and bubbled.
   *  A single field, not two copies of the string, so the two can never
   *  drift apart. */
  protected readonly lightboxMaskClass = 'listing-gallery__lightbox-mask';

  /** The element that had focus right before `openLightbox()` opened the
   *  dialog (whichever mosaic tile / hero tap / thumb the visitor actually
   *  activated) — restored once the lightbox closes, however it closes
   *  (close button, mask click, or Escape — see `onLightboxVisibleChange()`).
   *  A plain field, not a signal: nothing in the template reads it. */
  private lastFocusedElement: HTMLElement | null = null;
  /** Sibling of `ListingLocationComponent.focusReturnPending` — same
   *  `afterRenderEffect` pattern (focus the saved element on the render
   *  AFTER close, not synchronously inside the close handler) so a same-tick
   *  DOM swap under the trigger can't steal the `.focus()` call, per the
   *  fix in commit `897bbd4`. */
  protected readonly focusReturnPending = signal(false);

  readonly sortedImages = computed(() =>
    [...this.images()].sort((a, b) => a.sortOrder - b.sortOrder),
  );

  readonly mainImage = computed(() => {
    const sorted = this.sortedImages();
    if (sorted.length === 0) {
      return null;
    }
    const idx = this.activeIndex();
    return sorted[idx] ?? sorted[0] ?? null;
  });

  readonly hasMultipleImages = computed(() => this.sortedImages().length > 1);

  /** Desktop mosaic: the leading (largest) tile. */
  protected readonly mosaicMain = computed(() => this.sortedImages()[0] ?? null);

  /**
   * Desktop mosaic: up to 4 satellite tiles alongside the main one. The
   * mosaic itself never shows more than 5 photos at once (1 main + 4
   * satellites) — anything beyond that is reachable only through the
   * lightbox, via the "All N photos" button on the last visible tile.
   */
  protected readonly mosaicSatellites = computed(() => this.sortedImages().slice(1, 5));

  /** True total, including photos beyond the 5 the mosaic can physically show. */
  protected readonly totalCount = computed(() => this.sortedImages().length);

  constructor() {
    effect(() => {
      this.images();
      untracked(() => {
        this.activeIndex.set(0);
        this.lightboxOpen.set(false);
        this.lightboxIndex.set(0);
      });
    });

    afterRenderEffect(() => {
      if (!this.focusReturnPending()) return;
      this.lastFocusedElement?.focus();
      this.lastFocusedElement = null;
      this.focusReturnPending.set(false);
    });
  }

  protected selectIndex(index: number): void {
    const length = this.sortedImages().length;
    if (length === 0) {
      return;
    }
    const safe = ((index % length) + length) % length;
    this.activeIndex.set(safe);
  }

  protected goPrev(): void {
    this.selectIndex(this.activeIndex() - 1);
  }

  protected goNext(): void {
    this.selectIndex(this.activeIndex() + 1);
  }

  protected trackByImageId(_index: number, image: ListingImage): string {
    return image.id;
  }

  protected openLightbox(index: number): void {
    const length = this.sortedImages().length;
    if (length === 0) {
      return;
    }
    const safe = ((index % length) + length) % length;
    this.lastFocusedElement = document.activeElement as HTMLElement | null;
    this.lightboxIndex.set(safe);
    this.lightboxOpen.set(true);
  }

  protected closeLightbox(): void {
    this.onLightboxVisibleChange(false);
  }

  /** Wired to `p-dialog`'s `(visibleChange)` — the single funnel for every
   *  way the lightbox can close: the round close button, our own
   *  `window:keydown` Escape handler, and our own `window:mousedown`
   *  mask-click handler below (each of the latter two sets `lightboxOpen`
   *  itself, then flows back through here). Whichever path got here,
   *  closing always queues the focus-return — so Escape, the close button,
   *  and a mask click all restore focus identically; there are three ways
   *  in, but exactly one way out. */
  protected onLightboxVisibleChange(visible: boolean): void {
    this.lightboxOpen.set(visible);
    if (!visible) {
      this.focusReturnPending.set(true);
    }
  }

  protected lightboxPrev(): void {
    const length = this.sortedImages().length;
    if (length === 0) return;
    this.lightboxIndex.update((i) => ((i - 1) % length + length) % length);
  }

  protected lightboxNext(): void {
    const length = this.sortedImages().length;
    if (length === 0) return;
    this.lightboxIndex.update((i) => (i + 1) % length);
  }

  /**
   * Bound at `window` level (not on `<p-dialog>`) because PrimeNG's overlay
   * may render outside this component's own DOM subtree, so a template
   * `(keydown)` on the dialog tag itself can't be relied on to see it.
   *
   * Escape is handled HERE, not by `p-dialog`'s own `closeOnEscape`: PrimeNG
   * only binds its internal document Escape listener when `closeOnEscape`
   * AND `closable` are both true (`Dialog.bindGlobalListeners()` in
   * `primeng-dialog.mjs`), and this dialog deliberately sets `closable=false`
   * to suppress PrimeNG's default header close icon in favour of the custom
   * round one — which silently defeats `closeOnEscape` too. Handling Escape
   * ourselves, independent of that gate, is the fix (confirmed bug, not a
   * one-off — `ListingLocationMapComponent`'s full-screen map had the exact
   * same trap and gets the same treatment).
   */
  @HostListener('window:keydown', ['$event'])
  protected onWindowKeydown(event: KeyboardEvent): void {
    if (!this.lightboxOpen()) {
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.lightboxPrev();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.lightboxNext();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.closeLightbox();
    }
  }

  /**
   * Own mask/backdrop-click-to-dismiss, independent of PrimeNG's
   * `Dialog.enableModality()` gate: that method only binds ITS OWN
   * mask-click listener when `closable && dismissableMask` are both true
   * (same file as `onWindowKeydown()`'s `bindGlobalListeners()` reference),
   * so this dialog's `closable=false` silently defeats `[dismissableMask]`
   * too — the identical trap, a different PrimeNG code path. A lightbox
   * that visually looks dismissable-by-backdrop but silently isn't is a
   * real defect (not merely a nice-to-have), so this is handled the same
   * way Escape is: our own listener, gated on this dialog actually being
   * open, routed through `onLightboxVisibleChange()` so all three dismiss
   * paths (Escape, close button, mask click) restore focus identically.
   *
   * Bound at `window` (not on the mask element itself — PrimeNG renders it
   * outside this component's own DOM subtree via the overlay, same reason
   * as `onWindowKeydown()`) and fires ONLY when the mousedown's `target` IS
   * the mask element itself (identified by `lightboxMaskClass`, unique to
   * this dialog). PrimeNG's own mask div is the direct parent of the dialog
   * container (`primeng-dialog.mjs`'s inline template), so a click that
   * starts anywhere inside the dialog content — the image, the nav
   * buttons, the close button — always has `event.target` somewhere INSIDE
   * `.listing-gallery__lightbox`, never the mask div, and never reaches
   * here. `mousedown` (not `click`) mirrors PrimeNG's own reference
   * implementation.
   */
  @HostListener('window:mousedown', ['$event'])
  protected onWindowMousedown(event: MouseEvent): void {
    if (!this.lightboxOpen()) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && target.classList.contains(this.lightboxMaskClass)) {
      this.closeLightbox();
    }
  }
}
