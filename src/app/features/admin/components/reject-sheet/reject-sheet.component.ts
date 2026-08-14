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

import { REJECT_REASONS } from '../../models/reject-reason.model';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The design's `AdminRejectSheet` — a real modal bottom sheet (backdrop +
 * `role="dialog"`), shared by the mobile review card and both inspect
 * screens' reject flow. Traps focus while open and restores it to whatever
 * triggered the sheet on close, per the a11y non-negotiable.
 */
@Component({
  selector: 'app-reject-sheet',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './reject-sheet.component.html',
  styleUrl: './reject-sheet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RejectSheetComponent implements OnInit, OnDestroy {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private previouslyFocused: HTMLElement | null = null;

  readonly title = input<string>('');
  readonly reasonSel = input<string | null>(null);
  readonly note = input<string>('');
  readonly busy = input<boolean>(false);

  readonly reasonSelect = output<string>();
  readonly noteChange = output<string>();
  readonly cancel = output<void>();
  readonly confirm = output<void>();

  protected readonly reasons = REJECT_REASONS;

  constructor() {
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLElement>('[role="radio"]')?.focus();
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

  protected onNoteInput(event: Event): void {
    this.noteChange.emit((event.target as HTMLTextAreaElement).value);
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
