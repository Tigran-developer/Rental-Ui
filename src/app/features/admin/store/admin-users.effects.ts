import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { catchError, map, mergeMap, of, switchMap, tap, withLatestFrom } from 'rxjs';

import { getApiErrorCode } from '../../../api/api-error.model';
import { toApiErrorMessage } from '../../../api/http-error-message.util';
import { AdminUsersApiService } from '../services/admin-users-api.service';
import * as AdminUsersActions from './admin-users.actions';
import { selectUserRequestParams } from './admin-users.selectors';

function toErrorMessage(error: unknown): string {
  return toApiErrorMessage(error);
}

function toErrorCode(error: unknown): string | null {
  return getApiErrorCode(error);
}

/** Codes with dedicated, translated copy — `cannot_suspend_*` the UI already prevents by
 *  hiding/disabling the action (see `utils/admin-user-guards.util.ts`) but still handles
 *  gracefully if the server rejects it anyway (stale row, race with another admin tab);
 *  `user_not_found` covers a row deleted/changed between page load and the click. Anything
 *  else falls back to the raw (English) `ServiceError.Message` from the effect. */
const KNOWN_ERROR_MESSAGE_KEYS: Record<string, string> = {
  'admin.cannot_suspend_self': 'admin.users.errors.cannotSuspendSelf',
  'admin.cannot_suspend_admin': 'admin.users.errors.cannotSuspendAdmin',
  'admin.user_not_found': 'admin.users.errors.userNotFound',
};

@Injectable()
export class AdminUsersEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly usersApi = inject(AdminUsersApiService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);

  // ── Queue ──
  readonly loadUserQueue$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminUsersActions.loadUserQueue),
      withLatestFrom(this.store.select(selectUserRequestParams)),
      switchMap(([, params]) =>
        this.usersApi.getUserQueue(params).pipe(
          map((queue) => AdminUsersActions.loadUserQueueSuccess({ queue })),
          catchError((error: unknown) =>
            of(AdminUsersActions.loadUserQueueFailure({ error: toErrorMessage(error) })),
          ),
        ),
      ),
    ),
  );

  /** Tab switches, the debounced search, sort changes, and page changes all just re-run the
   *  current query. */
  readonly reloadOnFilterChange$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        AdminUsersActions.setUserStatusFilter,
        AdminUsersActions.setUserSearch,
        AdminUsersActions.setUserSort,
        AdminUsersActions.setUserPage,
      ),
      map(() => AdminUsersActions.loadUserQueue()),
    ),
  );

  /** "counts refetch after each mutation" — `summary` is computed server-side across the
   *  whole (search-filtered) queue, so re-running the query is simpler and more correct than
   *  reconciling optimistic arithmetic by hand. Same idiom as
   *  `AdminModerationEffects.refetchAfterDecision$` / `AdminCategoriesEffects.refetchAfterMutation$`. */
  readonly refetchAfterMutation$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        AdminUsersActions.verifyUserSuccess,
        AdminUsersActions.suspendUserSuccess,
        AdminUsersActions.reactivateUserSuccess,
      ),
      map(() => AdminUsersActions.loadUserQueue()),
    ),
  );

  // ── Verify / suspend / reactivate (mergeMap: multiple rows can be in flight at once) ──
  readonly verifyUser$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminUsersActions.verifyUser),
      mergeMap(({ userId }) =>
        this.usersApi.verifyUser(userId).pipe(
          map((user) => AdminUsersActions.verifyUserSuccess({ userId, user })),
          catchError((error: unknown) =>
            of(
              AdminUsersActions.verifyUserFailure({
                userId,
                error: toErrorMessage(error),
                errorCode: toErrorCode(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly suspendUser$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminUsersActions.suspendUser),
      mergeMap(({ userId }) =>
        this.usersApi.suspendUser(userId).pipe(
          map((user) => AdminUsersActions.suspendUserSuccess({ userId, user })),
          catchError((error: unknown) =>
            of(
              AdminUsersActions.suspendUserFailure({
                userId,
                error: toErrorMessage(error),
                errorCode: toErrorCode(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly reactivateUser$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminUsersActions.reactivateUser),
      mergeMap(({ userId }) =>
        this.usersApi.reactivateUser(userId).pipe(
          map((user) => AdminUsersActions.reactivateUserSuccess({ userId, user })),
          catchError((error: unknown) =>
            of(
              AdminUsersActions.reactivateUserFailure({
                userId,
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
  readonly verifySuccessToast$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AdminUsersActions.verifyUserSuccess),
        tap(() => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('admin.users.toast.verifySuccessTitle'),
            detail: this.translate.instant('admin.users.toast.verifySuccess'),
            life: 5000,
          });
        }),
      ),
    { dispatch: false },
  );

  readonly suspendSuccessToast$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AdminUsersActions.suspendUserSuccess),
        tap(() => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('admin.users.toast.suspendSuccessTitle'),
            detail: this.translate.instant('admin.users.toast.suspendSuccess'),
            life: 5000,
          });
        }),
      ),
    { dispatch: false },
  );

  readonly reactivateSuccessToast$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AdminUsersActions.reactivateUserSuccess),
        tap(() => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('admin.users.toast.reactivateSuccessTitle'),
            detail: this.translate.instant('admin.users.toast.reactivateSuccess'),
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
          AdminUsersActions.verifyUserFailure,
          AdminUsersActions.suspendUserFailure,
          AdminUsersActions.reactivateUserFailure,
        ),
        tap(({ errorCode, error }) => {
          const messageKey = errorCode !== null ? KNOWN_ERROR_MESSAGE_KEYS[errorCode] : undefined;
          const detail = messageKey !== undefined ? this.translate.instant(messageKey) : error;
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('admin.users.toast.actionFailureTitle'),
            detail,
            life: 7000,
          });
        }),
      ),
    { dispatch: false },
  );
}
