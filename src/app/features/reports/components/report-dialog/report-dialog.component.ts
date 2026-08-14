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

import { getApiErrorCode } from '../../../../api/api-error.model';
import { toApiErrorMessage } from '../../../../api/http-error-message.util';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { REPORT_REASONS } from '../../models/report-reason.model';
import { ReportsApiService } from '../../services/reports-api.service';
import type {
  CreateReportRequest,
  Report,
  ReportTargetTypeRequest,
} from '../../models/report.model';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** What's being reported — the caller (listing details / public profile) supplies this. */
export interface ReportDialogTarget {
  readonly targetType: ReportTargetTypeRequest;
  readonly targetId: string;
}

const TITLE_KEYS: Record<ReportTargetTypeRequest, string> = {
  listing: 'reports.dialog.titleListing',
  user: 'reports.dialog.titleUser',
  message: 'reports.dialog.titleMessage',
};

type DialogPhase = 'form' | 'submitting' | 'success' | 'alreadyReported' | 'error';

/**
 * The shared report-submission dialog wired to `POST /api/reports` (`ReportsApiService`) —
 * the 7-reason catalog (`REPORT_REASONS`) plus an optional free-text detail. Deliberately a
 * plain component with its own local state, not an NgRx slice: submission is a simple
 * request/response with no list to keep in sync, matching how `listing-details-page` already
 * calls a service directly and toasts the result for its own one-off actions (e.g. `onShare`).
 *
 * `report.already_reported` (409) is rendered as a normal, reassuring outcome — not an error
 * panel and no red toast — because filing a duplicate report on the same target is an expected
 * thing for a renter/owner to attempt, not a failure of theirs or the system's.
 *
 * Traps focus and restores it on close, same idiom as `admin-user-profile-dialog` /
 * `admin-report-detail-dialog`. The reason list is a real radio group (`role="radiogroup"` /
 * `role="radio"`), same idiom as `reject-panel`.
 */
@Component({
  selector: 'app-report-dialog',
  standalone: true,
  imports: [IconComponent, TranslatePipe],
  templateUrl: './report-dialog.component.html',
  styleUrl: './report-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportDialogComponent implements OnInit, OnDestroy {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly reportsApi = inject(ReportsApiService);
  private previouslyFocused: HTMLElement | null = null;

  readonly target = input.required<ReportDialogTarget>();

  readonly closed = output<void>();
  readonly submitted = output<Report>();

  protected readonly reasons = REPORT_REASONS;
  protected readonly titleKey = computed(() => TITLE_KEYS[this.target().targetType]);

  protected readonly selectedReason = signal<string | null>(null);
  protected readonly detail = signal('');
  protected readonly phase = signal<DialogPhase>('form');
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly isSubmitting = computed(() => this.phase() === 'submitting');
  protected readonly canSubmit = computed(
    () => this.selectedReason() !== null && this.phase() === 'form',
  );

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
    if (!this.isSubmitting()) this.closed.emit();
  }

  @HostListener('keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (!this.isSubmitting()) this.closed.emit();
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

  protected selectReason(key: string): void {
    if (this.phase() !== 'form') return;
    this.selectedReason.set(key);
  }

  protected onDetailInput(event: Event): void {
    this.detail.set((event.target as HTMLTextAreaElement).value);
  }

  protected submit(): void {
    const reasonCode = this.selectedReason();
    if (reasonCode === null || this.phase() !== 'form') return;

    const request: CreateReportRequest = {
      targetType: this.target().targetType,
      targetId: this.target().targetId,
      reasonCode,
      detail: this.detail().trim() || null,
    };

    this.phase.set('submitting');
    this.reportsApi.submitReport(request).subscribe({
      next: (report) => {
        this.phase.set('success');
        this.submitted.emit(report);
      },
      error: (error: unknown) => this.handleError(error),
    });
  }

  /** Set alongside `errorMessage` so the template can prefer a translated, precise message for
   *  a known code and fall back to the raw (English) server message otherwise. */
  protected readonly errorMessageKey = signal<string | null>(null);

  private handleError(error: unknown): void {
    const code = getApiErrorCode(error);
    if (code === 'report.already_reported') {
      // Not a failure — a duplicate report on the same target is an expected outcome, not an
      // error. See the class doc comment.
      this.phase.set('alreadyReported');
      return;
    }

    const messageKey = this.knownErrorMessageKey(code);
    this.errorMessageKey.set(messageKey);
    this.errorMessage.set(messageKey !== null ? null : toApiErrorMessage(error));
    this.phase.set('error');
  }

  private knownErrorMessageKey(code: string | null): string | null {
    switch (code) {
      case 'report.cannot_report_own':
        return 'reports.dialog.errors.cannotReportOwn';
      case 'report.user_blocked':
        return 'reports.dialog.errors.userBlocked';
      case 'report.invalid_reason':
        return 'reports.dialog.errors.invalidReason';
      case 'report.target_not_found':
        return 'reports.dialog.errors.targetNotFound';
      default:
        return null;
    }
  }

  protected tryAgain(): void {
    this.phase.set('form');
    this.errorMessage.set(null);
    this.errorMessageKey.set(null);
  }
}
