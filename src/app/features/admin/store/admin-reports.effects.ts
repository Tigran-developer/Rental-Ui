import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { catchError, map, mergeMap, of, switchMap, tap, withLatestFrom } from 'rxjs';

import { getApiErrorCode } from '../../../api/api-error.model';
import { toApiErrorMessage } from '../../../api/http-error-message.util';
import { AdminReportsApiService } from '../services/admin-reports-api.service';
import * as AdminReportsActions from './admin-reports.actions';
import { selectReportRequestParams } from './admin-reports.selectors';

function toErrorMessage(error: unknown): string {
  return toApiErrorMessage(error);
}

function toErrorCode(error: unknown): string | null {
  return getApiErrorCode(error);
}

/** `admin.report_not_found` is the only documented failure mode for resolve/dismiss/reopen
 *  (a report deleted or already actioned from another admin tab between load and click) —
 *  resolve/dismiss/reopen are otherwise idempotent 200s server-side, so a double-click never
 *  errors. Anything else falls back to the raw (English) `ServiceError.Message`. */
const KNOWN_ERROR_MESSAGE_KEYS: Record<string, string> = {
  'admin.report_not_found': 'admin.reports.errors.reportNotFound',
};

@Injectable()
export class AdminReportsEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly reportsApi = inject(AdminReportsApiService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);

  // ── Queue ──
  readonly loadReportQueue$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminReportsActions.loadReportQueue),
      withLatestFrom(this.store.select(selectReportRequestParams)),
      switchMap(([, params]) =>
        this.reportsApi.getReportQueue(params).pipe(
          map((queue) => AdminReportsActions.loadReportQueueSuccess({ queue })),
          catchError((error: unknown) =>
            of(AdminReportsActions.loadReportQueueFailure({ error: toErrorMessage(error) })),
          ),
        ),
      ),
    ),
  );

  /** Tab switches, the debounced search, the target-filter deep link, and page changes all
   *  just re-run the current query. */
  readonly reloadOnFilterChange$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        AdminReportsActions.setReportStatusFilter,
        AdminReportsActions.setReportSearch,
        AdminReportsActions.setReportTargetFilter,
        AdminReportsActions.setReportPage,
      ),
      map(() => AdminReportsActions.loadReportQueue()),
    ),
  );

  /** "refetch counts after each mutation" — `counts` is computed server-side across the whole
   *  (search/target-filtered) queue, so re-running the query is simpler and more correct than
   *  reconciling optimistic arithmetic by hand. Same idiom as `AdminUsersEffects.refetchAfterMutation$`. */
  readonly refetchAfterMutation$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        AdminReportsActions.resolveReportSuccess,
        AdminReportsActions.dismissReportSuccess,
        AdminReportsActions.reopenReportSuccess,
      ),
      map(() => AdminReportsActions.loadReportQueue()),
    ),
  );

  // ── Resolve / dismiss / reopen (mergeMap: multiple rows can be in flight at once) ──
  readonly resolveReport$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminReportsActions.resolveReport),
      mergeMap(({ reportId, note }) =>
        this.reportsApi.resolveReport(reportId, note).pipe(
          map((report) => AdminReportsActions.resolveReportSuccess({ reportId, report })),
          catchError((error: unknown) =>
            of(
              AdminReportsActions.resolveReportFailure({
                reportId,
                error: toErrorMessage(error),
                errorCode: toErrorCode(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly dismissReport$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminReportsActions.dismissReport),
      mergeMap(({ reportId, note }) =>
        this.reportsApi.dismissReport(reportId, note).pipe(
          map((report) => AdminReportsActions.dismissReportSuccess({ reportId, report })),
          catchError((error: unknown) =>
            of(
              AdminReportsActions.dismissReportFailure({
                reportId,
                error: toErrorMessage(error),
                errorCode: toErrorCode(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly reopenReport$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminReportsActions.reopenReport),
      mergeMap(({ reportId }) =>
        this.reportsApi.reopenReport(reportId).pipe(
          map((report) => AdminReportsActions.reopenReportSuccess({ reportId, report })),
          catchError((error: unknown) =>
            of(
              AdminReportsActions.reopenReportFailure({
                reportId,
                error: toErrorMessage(error),
                errorCode: toErrorCode(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  // ── Toasts ──
  readonly resolveSuccessToast$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AdminReportsActions.resolveReportSuccess),
        tap(() => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('admin.reports.toast.resolveSuccessTitle'),
            detail: this.translate.instant('admin.reports.toast.resolveSuccess'),
            life: 5000,
          });
        }),
      ),
    { dispatch: false },
  );

  readonly dismissSuccessToast$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AdminReportsActions.dismissReportSuccess),
        tap(() => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('admin.reports.toast.dismissSuccessTitle'),
            detail: this.translate.instant('admin.reports.toast.dismissSuccess'),
            life: 5000,
          });
        }),
      ),
    { dispatch: false },
  );

  readonly reopenSuccessToast$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AdminReportsActions.reopenReportSuccess),
        tap(() => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('admin.reports.toast.reopenSuccessTitle'),
            detail: this.translate.instant('admin.reports.toast.reopenSuccess'),
            life: 5000,
          });
        }),
      ),
    { dispatch: false },
  );

  readonly actionFailureToast$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          AdminReportsActions.resolveReportFailure,
          AdminReportsActions.dismissReportFailure,
          AdminReportsActions.reopenReportFailure,
        ),
        tap(({ errorCode, error }) => {
          const messageKey = errorCode !== null ? KNOWN_ERROR_MESSAGE_KEYS[errorCode] : undefined;
          const detail = messageKey !== undefined ? this.translate.instant(messageKey) : error;
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('admin.reports.toast.actionFailureTitle'),
            detail,
            life: 7000,
          });
        }),
      ),
    { dispatch: false },
  );
}
