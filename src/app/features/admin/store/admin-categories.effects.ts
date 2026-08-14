import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { catchError, map, mergeMap, of, switchMap, tap } from 'rxjs';

import { getApiErrorCode } from '../../../api/api-error.model';
import { toApiErrorMessage } from '../../../api/http-error-message.util';
import { AdminCategoriesApiService } from '../services/admin-categories-api.service';
import * as AdminCategoriesActions from './admin-categories.actions';

function toErrorMessage(error: unknown): string {
  return toApiErrorMessage(error);
}

function toErrorCode(error: unknown): string | null {
  return getApiErrorCode(error);
}

/** Error codes with dedicated inline UI (name field / delete dialog) — the failure effects
 *  below skip the generic toast for these so the admin isn't told twice. */
const INLINE_ONLY_ERROR_CODES = new Set<string>([
  'admin.category_name_taken',
  'admin.category_reassign_required',
  'admin.category_reassign_invalid',
]);

@Injectable()
export class AdminCategoriesEffects {
  private readonly actions$ = inject(Actions);
  private readonly categoriesApi = inject(AdminCategoriesApiService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);

  // ── Load ──
  readonly loadCategories$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminCategoriesActions.loadCategories),
      switchMap(() =>
        this.categoriesApi.getCategories().pipe(
          map((list) => AdminCategoriesActions.loadCategoriesSuccess({ list })),
          catchError((error: unknown) =>
            of(AdminCategoriesActions.loadCategoriesFailure({ error: toErrorMessage(error) })),
          ),
        ),
      ),
    ),
  );

  /** Refetch after every settled mutation so `summary` (and any server-side drift, e.g. a
   *  reassignment target's `listingCount`) stays authoritative — same idiom as
   *  AdminModerationEffects.refetchAfterDecision$. */
  readonly refetchAfterMutation$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        AdminCategoriesActions.createCategorySuccess,
        AdminCategoriesActions.updateCategorySuccess,
        AdminCategoriesActions.updateVisibilitySuccess,
        AdminCategoriesActions.reorderCategoriesSuccess,
        AdminCategoriesActions.deleteCategorySuccess,
        AdminCategoriesActions.deleteCategoryToNewCategoryPartialFailure,
      ),
      map(() => AdminCategoriesActions.loadCategories()),
    ),
  );

  // ── Create ──
  readonly createCategory$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminCategoriesActions.createCategory),
      mergeMap(({ tempId, request }) =>
        this.categoriesApi.createCategory(request).pipe(
          map((category) => AdminCategoriesActions.createCategorySuccess({ tempId, category })),
          catchError((error: unknown) =>
            of(
              AdminCategoriesActions.createCategoryFailure({
                tempId,
                error: toErrorMessage(error),
                errorCode: toErrorCode(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  // ── Rename / restyle ──
  readonly updateCategory$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminCategoriesActions.updateCategory),
      mergeMap(({ id, request }) =>
        this.categoriesApi.updateCategory(id, request).pipe(
          map((category) => AdminCategoriesActions.updateCategorySuccess({ id, category })),
          catchError((error: unknown) =>
            of(
              AdminCategoriesActions.updateCategoryFailure({
                id,
                error: toErrorMessage(error),
                errorCode: toErrorCode(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  // ── Visibility toggle ──
  readonly updateVisibility$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminCategoriesActions.updateVisibility),
      mergeMap(({ id, isVisible }) =>
        this.categoriesApi.updateVisibility(id, isVisible).pipe(
          map((category) => AdminCategoriesActions.updateVisibilitySuccess({ id, category })),
          catchError((error: unknown) =>
            of(
              AdminCategoriesActions.updateVisibilityFailure({
                id,
                error: toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  // ── Reorder ──
  readonly reorderCategories$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminCategoriesActions.reorderCategories),
      switchMap(({ orderedIds }) =>
        this.categoriesApi.reorderCategories(orderedIds).pipe(
          map((categories) => AdminCategoriesActions.reorderCategoriesSuccess({ categories })),
          catchError((error: unknown) =>
            of(AdminCategoriesActions.reorderCategoriesFailure({ error: toErrorMessage(error) })),
          ),
        ),
      ),
    ),
  );

  // ── Delete ──
  readonly deleteCategory$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminCategoriesActions.deleteCategory),
      mergeMap(({ id, reassignToCategoryId }) =>
        this.categoriesApi.deleteCategory(id, reassignToCategoryId).pipe(
          map(() => AdminCategoriesActions.deleteCategorySuccess({ id })),
          catchError((error: unknown) =>
            of(
              AdminCategoriesActions.deleteCategoryFailure({
                id,
                error: toErrorMessage(error),
                errorCode: toErrorCode(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  /** The "+ Move to a new category…" reassign option: create the new category first, then
   *  delete the old one targeting it. If the create step fails, nothing changed — a normal
   *  `deleteCategoryFailure`. If the delete step then fails, the new category genuinely
   *  exists — `deleteCategoryToNewCategoryPartialFailure` carries its id so the toast/refetch
   *  (see `refetchAfterMutation$` + `deletePartialFailureToast$`) can be accurate about it. */
  readonly deleteCategoryToNewCategory$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminCategoriesActions.deleteCategoryToNewCategory),
      mergeMap(({ id, newCategory }) =>
        this.categoriesApi.createCategory(newCategory).pipe(
          switchMap((created) =>
            this.categoriesApi.deleteCategory(id, created.id).pipe(
              map(() => AdminCategoriesActions.deleteCategorySuccess({ id })),
              catchError((error: unknown) =>
                of(
                  AdminCategoriesActions.deleteCategoryToNewCategoryPartialFailure({
                    id,
                    createdCategoryId: created.id,
                    error: toErrorMessage(error),
                  }),
                ),
              ),
            ),
          ),
          catchError((error: unknown) =>
            of(
              AdminCategoriesActions.deleteCategoryFailure({
                id,
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
  readonly createSuccessToast$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AdminCategoriesActions.createCategorySuccess),
        tap(() => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('admin.categories.toast.createSuccessTitle'),
            detail: this.translate.instant('admin.categories.toast.createSuccess'),
            life: 5000,
          });
        }),
      ),
    { dispatch: false },
  );

  readonly deleteSuccessToast$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AdminCategoriesActions.deleteCategorySuccess),
        tap(() => {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('admin.categories.toast.deleteSuccessTitle'),
            detail: this.translate.instant('admin.categories.toast.deleteSuccess'),
            life: 5000,
          });
        }),
      ),
    { dispatch: false },
  );

  readonly deletePartialFailureToast$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AdminCategoriesActions.deleteCategoryToNewCategoryPartialFailure),
        tap(() => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('admin.categories.toast.deletePartialFailureTitle'),
            detail: this.translate.instant('admin.categories.toast.deletePartialFailure'),
            life: 9000,
          });
        }),
      ),
    { dispatch: false },
  );

  /** Every other mutation failure gets a generic toast, except the codes that already have
   *  dedicated inline UI (create/rename name-taken on the name field; reassign-required/invalid
   *  in the delete dialog) — see INLINE_ONLY_ERROR_CODES. */
  readonly mutationFailureToast$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          AdminCategoriesActions.createCategoryFailure,
          AdminCategoriesActions.updateCategoryFailure,
          AdminCategoriesActions.updateVisibilityFailure,
          AdminCategoriesActions.reorderCategoriesFailure,
          AdminCategoriesActions.deleteCategoryFailure,
        ),
        tap((action) => {
          const errorCode = 'errorCode' in action ? action.errorCode : null;
          if (
            errorCode !== null &&
            errorCode !== undefined &&
            INLINE_ONLY_ERROR_CODES.has(errorCode)
          ) {
            return;
          }
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('admin.categories.toast.actionFailureTitle'),
            detail: action.error,
            life: 7000,
          });
        }),
      ),
    { dispatch: false },
  );
}
