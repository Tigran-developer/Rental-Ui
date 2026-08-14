import { createAction, props } from '@ngrx/store';

import type {
  AdminCategory,
  AdminCategoryList,
  CreateAdminCategoryRequest,
  UpdateAdminCategoryRequest,
} from '../models/admin-category.model';

// ── Load ─────────────────────────────────────────────────────────────────
export const loadCategories = createAction('[Admin Categories] Load Categories');

export const loadCategoriesSuccess = createAction(
  '[Admin Categories] Load Categories Success',
  props<{ list: AdminCategoryList }>(),
);

export const loadCategoriesFailure = createAction(
  '[Admin Categories] Load Categories Failure',
  props<{ error: string }>(),
);

// ── Create (optimistic: reducer inserts a placeholder row keyed by tempId) ─
export const createCategory = createAction(
  '[Admin Categories] Create Category',
  props<{ tempId: string; request: CreateAdminCategoryRequest }>(),
);

export const createCategorySuccess = createAction(
  '[Admin Categories] Create Category Success',
  props<{ tempId: string; category: AdminCategory }>(),
);

export const createCategoryFailure = createAction(
  '[Admin Categories] Create Category Failure',
  props<{ tempId: string; error: string; errorCode: string | null }>(),
);

export const clearCreateError = createAction('[Admin Categories] Clear Create Error');

// ── Rename / restyle (optimistic patch) ─────────────────────────────────
export const updateCategory = createAction(
  '[Admin Categories] Update Category',
  props<{ id: string; request: UpdateAdminCategoryRequest }>(),
);

export const updateCategorySuccess = createAction(
  '[Admin Categories] Update Category Success',
  props<{ id: string; category: AdminCategory }>(),
);

export const updateCategoryFailure = createAction(
  '[Admin Categories] Update Category Failure',
  props<{ id: string; error: string; errorCode: string | null }>(),
);

export const clearEditError = createAction(
  '[Admin Categories] Clear Edit Error',
  props<{ id: string }>(),
);

// ── Visibility toggle (optimistic patch) ────────────────────────────────
export const updateVisibility = createAction(
  '[Admin Categories] Update Visibility',
  props<{ id: string; isVisible: boolean }>(),
);

export const updateVisibilitySuccess = createAction(
  '[Admin Categories] Update Visibility Success',
  props<{ id: string; category: AdminCategory }>(),
);

export const updateVisibilityFailure = createAction(
  '[Admin Categories] Update Visibility Failure',
  props<{ id: string; error: string }>(),
);

// ── Reorder (optimistic; always sends the FULL ordered id list — see
// admin.category_order_mismatch) ────────────────────────────────────────
export const reorderCategories = createAction(
  '[Admin Categories] Reorder Categories',
  props<{ orderedIds: string[] }>(),
);

export const reorderCategoriesSuccess = createAction(
  '[Admin Categories] Reorder Categories Success',
  props<{ categories: AdminCategory[] }>(),
);

export const reorderCategoriesFailure = createAction(
  '[Admin Categories] Reorder Categories Failure',
  props<{ error: string }>(),
);

// ── Delete (non-optimistic) ──────────────────────────────────────────────
export const deleteCategory = createAction(
  '[Admin Categories] Delete Category',
  props<{ id: string; reassignToCategoryId?: string }>(),
);

export const deleteCategorySuccess = createAction(
  '[Admin Categories] Delete Category Success',
  props<{ id: string }>(),
);

export const deleteCategoryFailure = createAction(
  '[Admin Categories] Delete Category Failure',
  props<{ id: string; error: string; errorCode: string | null }>(),
);

/**
 * The design's "+ Move to a new category…" reassign option. The backend `DELETE` only
 * accepts an *existing* `reassignToCategoryId`, so this is implemented as a two-step
 * create-then-delete chain in the effect — see AdminCategoriesEffects.deleteCategoryToNewCategory$.
 */
export const deleteCategoryToNewCategory = createAction(
  '[Admin Categories] Delete Category To New Category',
  props<{ id: string; newCategory: CreateAdminCategoryRequest }>(),
);

/**
 * The create step of `deleteCategoryToNewCategory` succeeded but the delete step then
 * failed — the new category now genuinely exists server-side. The UI must not claim the
 * old category is gone; the effect that dispatches this also triggers a `loadCategories()`
 * refetch so the list reflects reality (both the surviving old category and the new one).
 */
export const deleteCategoryToNewCategoryPartialFailure = createAction(
  '[Admin Categories] Delete Category To New Category Partial Failure',
  props<{ id: string; createdCategoryId: string; error: string }>(),
);

export const clearDeleteError = createAction(
  '[Admin Categories] Clear Delete Error',
  props<{ id: string }>(),
);
