import { createFeatureSelector, createSelector } from '@ngrx/store';

import type { AdminCategoriesSummary, AdminCategory } from '../models/admin-category.model';
import { adminCategoriesFeatureKey } from './admin-categories.reducer';
import type { AdminCategoriesState } from './admin-categories.state';

export const selectAdminCategoriesState =
  createFeatureSelector<AdminCategoriesState>(adminCategoriesFeatureKey);

export const selectCategories = createSelector(
  selectAdminCategoriesState,
  (state: AdminCategoriesState): AdminCategory[] => state.items,
);

export const selectCategoriesSummary = createSelector(
  selectAdminCategoriesState,
  (state: AdminCategoriesState): AdminCategoriesSummary => state.summary,
);

export const selectCategoriesLoading = createSelector(
  selectAdminCategoriesState,
  (state: AdminCategoriesState): boolean => state.isLoading,
);

export const selectCategoriesError = createSelector(
  selectAdminCategoriesState,
  (state: AdminCategoriesState): string | null => state.error,
);

export const selectIsCreatingCategory = createSelector(
  selectAdminCategoriesState,
  (state: AdminCategoriesState): boolean => state.isCreating,
);

export const selectCreateError = createSelector(
  selectAdminCategoriesState,
  (state: AdminCategoriesState): string | null => state.createError,
);

export const selectCreateErrorCode = createSelector(
  selectAdminCategoriesState,
  (state: AdminCategoriesState): string | null => state.createErrorCode,
);

export const selectCategoryActionIds = createSelector(
  selectAdminCategoriesState,
  (state: AdminCategoriesState): string[] => state.actionIds,
);

export const selectEditErrorCodeById = createSelector(
  selectAdminCategoriesState,
  (state: AdminCategoriesState): Record<string, string | null> => state.editErrorCodeById,
);

export const selectIsReordering = createSelector(
  selectAdminCategoriesState,
  (state: AdminCategoriesState): boolean => state.isReordering,
);

export const selectDeletingId = createSelector(
  selectAdminCategoriesState,
  (state: AdminCategoriesState): string | null => state.deletingId,
);

export const selectDeleteError = createSelector(
  selectAdminCategoriesState,
  (state: AdminCategoriesState): string | null => state.deleteError,
);

export const selectDeleteErrorCode = createSelector(
  selectAdminCategoriesState,
  (state: AdminCategoriesState): string | null => state.deleteErrorCode,
);
