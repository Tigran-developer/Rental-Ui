import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  afterNextRender,
  inject,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { CategoryFormPanelComponent } from '../category-form-panel/category-form-panel.component';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Mobile-only bottom sheet wrapping `CategoryFormPanelComponent` — the design's
 * `AdminCategoriesMobile` edit sheet (`editing` state). Desktop uses the same form panel
 * inline in the table row instead (no overlay). Traps focus while open and restores it on
 * close, mirroring `RejectSheetComponent`'s idiom exactly (same non-negotiable applies here).
 */
@Component({
  selector: 'app-category-edit-sheet',
  standalone: true,
  imports: [CategoryFormPanelComponent, TranslatePipe],
  templateUrl: './category-edit-sheet.component.html',
  styleUrl: './category-edit-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryEditSheetComponent implements OnInit, OnDestroy {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private previouslyFocused: HTMLElement | null = null;

  readonly name = input<string>('');
  readonly iconName = input<string>('');
  readonly colorHex = input<string>('');
  readonly busy = input<boolean>(false);
  readonly nameErrorMessage = input<string | null>(null);

  readonly nameChange = output<string>();
  readonly iconChange = output<string>();
  readonly colorChange = output<string>();
  readonly cancel = output<void>();
  readonly confirm = output<void>();

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

  protected onBackdropClick(): void {
    if (!this.busy()) this.cancel.emit();
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
