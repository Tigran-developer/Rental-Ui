import { DatePipe } from '@angular/common';
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

import { AvatarComponent } from '../../../../shared/ui/avatar/avatar.component';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { reportReasonLabelKey } from '../../../reports/models/report-reason.model';
import type { AdminReportRow } from '../../models/admin-report.model';
import { AdminReportSeverityPillComponent } from '../admin-report-severity-pill/admin-report-severity-pill.component';
import { AdminReportStatusPillComponent } from '../admin-report-status-pill/admin-report-status-pill.component';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const TYPE_ICON: Record<AdminReportRow['targetType'], string> = {
  Listing: 'tag',
  User: 'user',
  Message: 'message',
};

const TYPE_LABEL_KEYS: Record<AdminReportRow['targetType'], string> = {
  Listing: 'admin.reports.detail.typeListing',
  User: 'admin.reports.detail.typeUser',
  Message: 'admin.reports.detail.typeMessage',
};

/**
 * The design's `AdminReportDetailModal` (desktop centered dialog) / bottom sheet (mobile) — the
 * full report: target, severity/status, reason, the reporter's free-text note (`detail` — see
 * `admin-report.model.ts`'s header comment on why there's no separate `reporterNote` field on
 * the wire), reporter identity, timestamps, and — once triaged — the resolution note. Renders
 * as a centered modal on desktop and a full-bleed sheet on mobile, and traps focus / restores
 * it on close, same `isDesktop`-flag idiom as `AdminUserProfileDialogComponent`.
 *
 * Resolve/Dismiss accept an optional note via the textarea below the actions; Reopen does not
 * (mirrors `AdminReportsApiService.reopenReport`, which takes no body).
 */
@Component({
  selector: 'app-admin-report-detail-dialog',
  standalone: true,
  imports: [
    AdminReportSeverityPillComponent,
    AdminReportStatusPillComponent,
    AvatarComponent,
    DatePipe,
    IconComponent,
    TranslatePipe,
  ],
  templateUrl: './admin-report-detail-dialog.component.html',
  styleUrl: './admin-report-detail-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReportDetailDialogComponent implements OnInit, OnDestroy {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private previouslyFocused: HTMLElement | null = null;

  readonly report = input.required<AdminReportRow>();
  readonly isDesktop = input<boolean>(false);
  readonly busy = input<boolean>(false);

  readonly close = output<void>();
  readonly resolve = output<{ note?: string }>();
  readonly dismiss = output<{ note?: string }>();
  readonly reopen = output<void>();

  protected readonly note = signal('');

  protected readonly typeIcon = computed(() => TYPE_ICON[this.report().targetType]);
  protected readonly typeLabelKey = computed(() => TYPE_LABEL_KEYS[this.report().targetType]);
  protected readonly reasonLabelKey = computed(() =>
    reportReasonLabelKey(this.report().reasonCode),
  );
  protected readonly isOpen = computed(() => this.report().status === 'Open');
  protected readonly isTargetUser = computed(() => this.report().targetType === 'User');

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
    if (!this.busy()) this.close.emit();
  }

  @HostListener('keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (!this.busy()) this.close.emit();
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

  protected onNoteInput(event: Event): void {
    this.note.set((event.target as HTMLTextAreaElement).value);
  }

  protected onResolve(): void {
    const trimmed = this.note().trim();
    this.resolve.emit(trimmed ? { note: trimmed } : {});
  }

  protected onDismiss(): void {
    const trimmed = this.note().trim();
    this.dismiss.emit(trimmed ? { note: trimmed } : {});
  }
}
