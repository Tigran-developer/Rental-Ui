import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { catchError, map, mergeMap, of, switchMap, tap, withLatestFrom } from 'rxjs';

import { toApiErrorMessage } from '../../../api/http-error-message.util';
import { AdminListingsApiService } from '../services/admin-listings-api.service';
import * as AdminModerationActions from './admin-moderation.actions';
import { selectQueueRequestParams } from './admin-moderation.selectors';

function toErrorMessage(error: unknown): string {
  return toApiErrorMessage(error);
}

@Injectable()
export class AdminModerationEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly adminListingsApi = inject(AdminListingsApiService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);

  // ── Queue ──
  readonly loadListingQueue$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminModerationActions.loadListingQueue),
      withLatestFrom(this.store.select(selectQueueRequestParams)),
      switchMap(([, params]) =>
        this.adminListingsApi.getListingQueue(params).pipe(
          map((queue) => AdminModerationActions.loadListingQueueSuccess({ queue })),
          catchError((error: unknown) =>
            of(AdminModerationActions.loadListingQueueFailure({ error: toErrorMessage(error) })),
          ),
        ),
      ),
    ),
  );

  /** Tab switches and page changes both just re-run the current query. */
  readonly reloadOnFilterChange$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminModerationActions.setQueueStatusFilter, AdminModerationActions.setQueuePage),
      map(() => AdminModerationActions.loadListingQueue()),
    ),
  );

  /** "counts refetch after each mutation" — the queue endpoint's `counts` are
   * the authoritative source (they're computed server-side across the whole
   * queue, not just the current page), so re-running the query is simpler
   * and more correct than reconciling optimistic arithmetic by hand. */
  readonly refetchAfterDecision$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        AdminModerationActions.approveListingSuccess,
        AdminModerationActions.rejectListingSuccess,
      ),
      map(() => AdminModerationActions.loadListingQueue()),
    ),
  );

  // ── Approve / reject (mergeMap: multiple rows can be in flight at once) ──
  readonly approveListing$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminModerationActions.approveListing),
      mergeMap(({ listingId }) =>
        this.adminListingsApi.approveListing(listingId).pipe(
          map(() => AdminModerationActions.approveListingSuccess({ listingId })),
          catchError((error: unknown) =>
            of(
              AdminModerationActions.approveListingFailure({
                listingId,
                error: toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly rejectListing$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminModerationActions.rejectListing),
      mergeMap(({ listingId, reasonCode, note }) =>
        this.adminListingsApi.rejectListing(listingId, reasonCode, note).pipe(
          map(() => AdminModerationActions.rejectListingSuccess({ listingId })),
          catchError((error: unknown) =>
            of(
              AdminModerationActions.rejectListingFailure({
                listingId,
                error: toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  // ── Recategorise ──
  readonly updateListingCategory$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminModerationActions.updateListingCategory),
      mergeMap(({ listingId, categoryId }) =>
        this.adminListingsApi.updateListingCategory(listingId, categoryId).pipe(
          map((detail) =>
            AdminModerationActions.updateListingCategorySuccess({ listingId, detail }),
          ),
          catchError((error: unknown) =>
            of(
              AdminModerationActions.updateListingCategoryFailure({
                listingId,
                error: toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  // ── Detail ──
  readonly loadListingDetail$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminModerationActions.loadListingDetail),
      switchMap(({ listingId }) =>
        this.adminListingsApi.getListingDetail(listingId).pipe(
          map((detail) => AdminModerationActions.loadListingDetailSuccess({ detail })),
          catchError((error: unknown) =>
            of(AdminModerationActions.loadListingDetailFailure({ error: toErrorMessage(error) })),
          ),
        ),
      ),
    ),
  );

  // ── Toasts ──
  readonly approveSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AdminModerationActions.approveListingSuccess),
        tap(() => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('admin.pendingListings.toast.approveSuccessTitle'),
            detail: this.translate.instant('admin.pendingListings.toast.approveSuccess'),
            life: 5000,
          });
        }),
      ),
    { dispatch: false },
  );

  readonly rejectSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AdminModerationActions.rejectListingSuccess),
        tap(() => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('admin.pendingListings.toast.rejectSuccessTitle'),
            detail: this.translate.instant('admin.pendingListings.toast.rejectSuccess'),
            life: 5000,
          });
        }),
      ),
    { dispatch: false },
  );

  readonly actionFailure$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          AdminModerationActions.approveListingFailure,
          AdminModerationActions.rejectListingFailure,
          AdminModerationActions.updateListingCategoryFailure,
        ),
        tap(({ error }) => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('admin.pendingListings.toast.actionFailureTitle'),
            detail: error,
            life: 7000,
          });
        }),
      ),
    { dispatch: false },
  );
}
