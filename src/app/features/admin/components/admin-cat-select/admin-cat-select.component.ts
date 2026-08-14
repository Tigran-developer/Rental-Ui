import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { ListingCategoryOption } from '../../../listings/models/create-listing.model';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';

/**
 * The design's `AdminCatSelect`: a compact dropdown showing a colour tile +
 * category name, used on the review card's meta row and the inspect page's
 * category card. The backend has no per-category colour/icon yet (Phase 2) —
 * per the Phase 1 spec we render every tile with the same neutral,
 * token-based treatment instead of inventing a colour map.
 */
@Component({
  selector: 'app-admin-cat-select',
  standalone: true,
  imports: [IconComponent, TranslatePipe],
  templateUrl: './admin-cat-select.component.html',
  styleUrl: './admin-cat-select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCatSelectComponent {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  @ViewChild('trigger') private readonly triggerRef?: ElementRef<HTMLButtonElement>;

  readonly categories = input<ListingCategoryOption[]>([]);
  readonly value = input<string | null>(null);
  readonly disabled = input<boolean>(false);
  /** Admin console Phase 6 ("Needs category fix"): true when the listing has a pending
   *  category suggestion (`AdminListingSummary.suggestedCategoryId` non-null) — tints the
   *  trigger to match the design's flagged `AdminCatSelect` state. */
  readonly flagged = input<boolean>(false);

  readonly valueChange = output<{ categoryId: string; categoryName: string }>();

  protected readonly isOpen = signal(false);

  protected readonly selectedCategory = computed<ListingCategoryOption | null>(() => {
    const id = this.value();
    if (!id) return null;
    return this.categories().find((c) => c.id === id) ?? null;
  });

  protected toggle(): void {
    if (this.disabled()) return;
    this.isOpen.update((open) => !open);
  }

  protected select(category: ListingCategoryOption): void {
    this.closePanel();
    if (category.id === this.value()) return;
    this.valueChange.emit({ categoryId: category.id, categoryName: category.name });
  }

  protected close(): void {
    this.closePanel();
  }

  /**
   * Closes the option panel and, when the just-selected/just-cancelled option button was
   * focused (the keyboard path — `role="option"` buttons sit in normal Tab order after the
   * trigger), moves focus back to the trigger before that option is torn down by the `@if`.
   * Without this, a keyboard user's focus is silently dropped to `<body>` on every selection —
   * the native `<select>` this replaces never does that.
   */
  private closePanel(): void {
    const active = document.activeElement;
    const focusWasInPanel = active instanceof Node && this.host.nativeElement.contains(active);
    this.isOpen.set(false);
    if (focusWasInPanel) {
      this.triggerRef?.nativeElement.focus();
    }
  }

  protected isSelected(category: ListingCategoryOption): boolean {
    return category.id === this.value();
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  @HostListener('keydown.escape')
  protected onEscape(): void {
    this.close();
  }
}
