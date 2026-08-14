import { createReducer, on } from '@ngrx/store';

import type { AdminCategory } from '../models/admin-category.model';
import * as AdminCategoriesActions from './admin-categories.actions';
import {
  initialAdminCategoriesState,
  type AdminCategoriesRollbackEntry,
  type AdminCategoriesState,
} from './admin-categories.state';

export const adminCategoriesFeatureKey = 'adminCategories' as const;

function addId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

function removeId(ids: string[], id: string): string[] {
  return ids.filter((existing) => existing !== id);
}

function removeItem(items: AdminCategory[], id: string): AdminCategory[] {
  return items.filter((item) => item.id !== id);
}

function replaceItem(items: AdminCategory[], id: string, next: AdminCategory): AdminCategory[] {
  return items.map((item) => (item.id === id ? next : item));
}

function patchItem(
  items: AdminCategory[],
  id: string,
  patch: Partial<AdminCategory>,
): AdminCategory[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function withoutRollback(
  rollbacks: Record<string, AdminCategoriesRollbackEntry>,
  id: string,
): Record<string, AdminCategoriesRollbackEntry> {
  const { [id]: _removed, ...rest } = rollbacks;
  return rest;
}

function withoutEditError(
  map: Record<string, string | null>,
  id: string,
): Record<string, string | null> {
  const { [id]: _removed, ...rest } = map;
  return rest;
}

/** Reorders `items` to match `orderedIds`; drops any id that isn't a known item (defensive —
 *  the backend response is the source of truth for the confirmed order). */
function reorderItems(items: AdminCategory[], orderedIds: string[]): AdminCategory[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return orderedIds
    .map((id) => byId.get(id))
    .filter((item): item is AdminCategory => item !== undefined);
}

export const adminCategoriesReducer = createReducer(
  initialAdminCategoriesState,

  // ── Load ──
  on(
    AdminCategoriesActions.loadCategories,
    (state): AdminCategoriesState => ({ ...state, isLoading: true, error: null }),
  ),
  on(
    AdminCategoriesActions.loadCategoriesSuccess,
    (state, { list }): AdminCategoriesState => ({
      ...state,
      items: list.items,
      summary: list.summary,
      isLoading: false,
      error: null,
    }),
  ),
  on(
    AdminCategoriesActions.loadCategoriesFailure,
    (state, { error }): AdminCategoriesState => ({ ...state, isLoading: false, error }),
  ),

  // ── Create (optimistic) ──
  on(AdminCategoriesActions.createCategory, (state, { tempId, request }): AdminCategoriesState => {
    const placeholder: AdminCategory = {
      id: tempId,
      name: request.name,
      slug: '',
      iconName: request.iconName ?? null,
      colorHex: request.colorHex ?? null,
      displayOrder: state.items.length,
      isVisible: true,
      listingCount: 0,
    };
    return {
      ...state,
      items: [...state.items, placeholder],
      summary: {
        ...state.summary,
        totalCategories: state.summary.totalCategories + 1,
        visibleCount: state.summary.visibleCount + 1,
      },
      isCreating: true,
      createError: null,
      createErrorCode: null,
      rollbacks: { ...state.rollbacks, [tempId]: { item: null, summary: state.summary } },
    };
  }),
  on(
    AdminCategoriesActions.createCategorySuccess,
    (state, { tempId, category }): AdminCategoriesState => ({
      ...state,
      items: replaceItem(state.items, tempId, category),
      isCreating: false,
      rollbacks: withoutRollback(state.rollbacks, tempId),
    }),
  ),
  on(
    AdminCategoriesActions.createCategoryFailure,
    (state, { tempId, error, errorCode }): AdminCategoriesState => {
      const rollback = state.rollbacks[tempId];
      return {
        ...state,
        items: removeItem(state.items, tempId),
        summary: rollback?.summary ?? state.summary,
        isCreating: false,
        createError: error,
        createErrorCode: errorCode,
        rollbacks: withoutRollback(state.rollbacks, tempId),
      };
    },
  ),
  on(
    AdminCategoriesActions.clearCreateError,
    (state): AdminCategoriesState => ({ ...state, createError: null, createErrorCode: null }),
  ),

  // ── Rename / restyle (optimistic) ──
  on(AdminCategoriesActions.updateCategory, (state, { id, request }): AdminCategoriesState => {
    const previous = state.items.find((item) => item.id === id) ?? null;
    const patch: Partial<AdminCategory> = {
      ...(request.name !== undefined ? { name: request.name } : {}),
      ...(request.iconName !== undefined
        ? { iconName: request.iconName === '' ? null : request.iconName }
        : {}),
      ...(request.colorHex !== undefined
        ? { colorHex: request.colorHex === '' ? null : request.colorHex }
        : {}),
    };
    return {
      ...state,
      items: patchItem(state.items, id, patch),
      actionIds: addId(state.actionIds, id),
      rollbacks: { ...state.rollbacks, [id]: { item: previous, summary: state.summary } },
      editErrorCodeById: { ...state.editErrorCodeById, [id]: null },
    };
  }),
  on(
    AdminCategoriesActions.updateCategorySuccess,
    (state, { id, category }): AdminCategoriesState => ({
      ...state,
      items: replaceItem(state.items, id, category),
      actionIds: removeId(state.actionIds, id),
      rollbacks: withoutRollback(state.rollbacks, id),
    }),
  ),
  on(
    AdminCategoriesActions.updateCategoryFailure,
    (state, { id, error, errorCode }): AdminCategoriesState => {
      const rollback = state.rollbacks[id];
      const items = rollback?.item ? replaceItem(state.items, id, rollback.item) : state.items;
      return {
        ...state,
        items,
        actionIds: removeId(state.actionIds, id),
        rollbacks: withoutRollback(state.rollbacks, id),
        editErrorCodeById: { ...state.editErrorCodeById, [id]: errorCode },
        error,
      };
    },
  ),
  on(
    AdminCategoriesActions.clearEditError,
    (state, { id }): AdminCategoriesState => ({
      ...state,
      editErrorCodeById: withoutEditError(state.editErrorCodeById, id),
    }),
  ),

  // ── Visibility toggle (optimistic) ──
  on(AdminCategoriesActions.updateVisibility, (state, { id, isVisible }): AdminCategoriesState => {
    const previous = state.items.find((item) => item.id === id) ?? null;
    return {
      ...state,
      items: patchItem(state.items, id, { isVisible }),
      summary: {
        ...state.summary,
        visibleCount: Math.max(0, state.summary.visibleCount + (isVisible ? 1 : -1)),
      },
      actionIds: addId(state.actionIds, id),
      rollbacks: { ...state.rollbacks, [id]: { item: previous, summary: state.summary } },
    };
  }),
  on(
    AdminCategoriesActions.updateVisibilitySuccess,
    (state, { id, category }): AdminCategoriesState => ({
      ...state,
      items: replaceItem(state.items, id, category),
      actionIds: removeId(state.actionIds, id),
      rollbacks: withoutRollback(state.rollbacks, id),
    }),
  ),
  on(
    AdminCategoriesActions.updateVisibilityFailure,
    (state, { id, error }): AdminCategoriesState => {
      const rollback = state.rollbacks[id];
      const items = rollback?.item ? replaceItem(state.items, id, rollback.item) : state.items;
      return {
        ...state,
        items,
        summary: rollback?.summary ?? state.summary,
        actionIds: removeId(state.actionIds, id),
        rollbacks: withoutRollback(state.rollbacks, id),
        error,
      };
    },
  ),

  // ── Reorder (optimistic; full id list) ──
  on(
    AdminCategoriesActions.reorderCategories,
    (state, { orderedIds }): AdminCategoriesState => ({
      ...state,
      items: reorderItems(state.items, orderedIds),
      isReordering: true,
      reorderError: null,
      savedOrder: state.items.map((item) => item.id),
    }),
  ),
  on(
    AdminCategoriesActions.reorderCategoriesSuccess,
    (state, { categories }): AdminCategoriesState => ({
      ...state,
      items: categories,
      isReordering: false,
      savedOrder: null,
    }),
  ),
  on(AdminCategoriesActions.reorderCategoriesFailure, (state, { error }): AdminCategoriesState => {
    const items = state.savedOrder ? reorderItems(state.items, state.savedOrder) : state.items;
    return { ...state, items, isReordering: false, reorderError: error, savedOrder: null };
  }),

  // ── Delete (non-optimistic) ──
  on(
    AdminCategoriesActions.deleteCategory,
    (state, { id }): AdminCategoriesState => ({
      ...state,
      deletingId: id,
      deleteError: null,
      deleteErrorCode: null,
    }),
  ),
  on(
    AdminCategoriesActions.deleteCategorySuccess,
    (state, { id }): AdminCategoriesState => ({
      ...state,
      items: removeItem(state.items, id),
      deletingId: state.deletingId === id ? null : state.deletingId,
      deleteError: null,
      deleteErrorCode: null,
    }),
  ),
  on(
    AdminCategoriesActions.deleteCategoryFailure,
    (state, { id, error, errorCode }): AdminCategoriesState => ({
      ...state,
      deletingId: state.deletingId === id ? null : state.deletingId,
      deleteError: error,
      deleteErrorCode: errorCode,
    }),
  ),
  on(
    AdminCategoriesActions.deleteCategoryToNewCategory,
    (state, { id }): AdminCategoriesState => ({
      ...state,
      deletingId: id,
      deleteError: null,
      deleteErrorCode: null,
    }),
  ),
  on(
    AdminCategoriesActions.deleteCategoryToNewCategoryPartialFailure,
    (state, { id, error }): AdminCategoriesState => ({
      ...state,
      deletingId: state.deletingId === id ? null : state.deletingId,
      deleteError: error,
      deleteErrorCode: null,
    }),
  ),
  on(
    AdminCategoriesActions.clearDeleteError,
    (state): AdminCategoriesState => ({ ...state, deleteError: null, deleteErrorCode: null }),
  ),
);
