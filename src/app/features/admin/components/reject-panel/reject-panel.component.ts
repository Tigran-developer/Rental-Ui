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

/**
 * The design's inline reject-reason panel — `AdminReviewDesktop`'s expanding
 * `#FFFBFA` region (2-column reason grid) and `AdminInspectDesktop`'s
 * narrower rail version (1 column). Not a modal — it's inline content within
 * the card/rail — so focus is placed sensibly and restored on close, without
 * a hard Tab-trap (compare `RejectSheetComponent`, the true modal).
 */
@Component({
  selector: 'app-reject-panel',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './reject-panel.component.html',
  styleUrl: './reject-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RejectPanelComponent implements OnInit, OnDestroy {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private previouslyFocused: HTMLElement | null = null;

  readonly reasonSel = input<string | null>(null);
  readonly note = input<string>('');
  readonly busy = input<boolean>(false);
  readonly columns = input<1 | 2>(2);

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

  @HostListener('keydown.escape')
  protected onEscape(): void {
    this.cancel.emit();
  }

  protected onNoteInput(event: Event): void {
    this.noteChange.emit((event.target as HTMLTextAreaElement).value);
  }
}
