import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import type { AdminCategory } from '../../models/admin-category.model';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Sentinel `<select>` value for the design's "+ Move to a new category…" option. */
const NEW_CATEGORY_OPTION = '__new__';

/**
 * The design's delete confirmation — a simple confirm when the category has no listings, or
 * a required reassign-target picker (existing category, or "+ Move to a new category…") when
 * it does, with the confirm button disabled until a valid target is chosen. Renders as a
 * centered modal on desktop and a bottom sheet on mobile (`isDesktop` only changes the CSS
 * shell — the markup and behaviour are identical) and traps focus like `RejectSheetComponent`.
 *
 * The "+ Move to a new category…" option is implemented by the page as create-then-delete
 * (the backend `DELETE` only accepts an *existing* `reassignToCategoryId`) — this component
 * just collects the new name and emits `confirmNew`; it has no knowledge of that two-step
 * chain.
 */
@Component({
  selector: 'app-category-delete-dialog',
  standalone: true,
  imports: [IconComponent, TranslatePipe],
  templateUrl: './category-delete-dialog.component.html',
  styleUrl: './category-delete-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryDeleteDialogComponent implements OnInit, OnDestroy {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private previouslyFocused: HTMLElement | null = null;

  readonly categoryName = input.required<string>();
  readonly listingCount = input.required<number>();
  readonly otherCategories = input<AdminCategory[]>([]);
  readonly isDesktop = input<boolean>(false);
  readonly busy = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);

  readonly cancel = output<void>();
  readonly confirmSimple = output<void>();
  readonly confirmExisting = output<string>();
  readonly confirmNew = output<string>();

  protected readonly reassignTarget = signal<string>('');
  protected readonly newCategoryName = signal<string>('');
  protected readonly newCategoryOption = NEW_CATEGORY_OPTION;

  protected readonly hasListings = computed(() => this.listingCount() > 0);

  /**
   * Two-form pluralisation (singular vs. "other"), the same idiom used elsewhere in this
   * codebase for count-dependent copy (e.g. `allReviews.oneReview`/`allReviews.reviews`,
   * `listings.booking.night`/`nights`) — ngx-translate here has no ICU/plural-rules support,
   * so each locale's `hasListings`/`hasListingsOne` string carries whatever grammar it needs
   * (Russian's genitive few/many are collapsed into one shorthand string; Armenian nouns don't
   * inflect after a numeral at all, so its two strings differ only in the trailing pronoun).
   */
  protected readonly hasListingsKey = computed(() =>
    this.listingCount() === 1
      ? 'admin.categories.deleteDialog.hasListingsOne'
      : 'admin.categories.deleteDialog.hasListings',
  );

  protected readonly isNewCategorySelected = computed(
    () => this.reassignTarget() === NEW_CATEGORY_OPTION,
  );

  protected readonly deleteValid = computed(() => {
    if (!this.hasListings()) return true;
    if (this.isNewCategorySelected()) return this.newCategoryName().trim().length > 0;
    return this.reassignTarget() !== '';
  });

  constructor() {
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    });
  }

  ngOnInit(): void {
    this.previouslyFocused = document.activeElement as HTMLElement | null;
  }

  ngOnDestroy(): void {
    this.previouslyFocused?.focus?.();
  }

  protected onReassignTargetChange(event: Event): void {
    this.reassignTarget.set((event.target as HTMLSelectElement).value);
  }

  protected onNewCategoryNameInput(event: Event): void {
    this.newCategoryName.set((event.target as HTMLInputElement).value);
  }

  protected onBackdropClick(): void {
    if (!this.busy()) this.cancel.emit();
  }

  protected confirm(): void {
    if (this.busy() || !this.deleteValid()) return;
    if (!this.hasListings()) {
      this.confirmSimple.emit();
      return;
    }
    if (this.isNewCategorySelected()) {
      this.confirmNew.emit(this.newCategoryName().trim());
      return;
    }
    this.confirmExisting.emit(this.reassignTarget());
  }

  @HostListener('keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (!this.busy()) this.cancel.emit();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusables = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
