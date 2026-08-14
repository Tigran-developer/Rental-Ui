import { createReducer, on } from '@ngrx/store';

import type {
  AdminListingQueueCounts,
  AdminListingSummary,
} from '../models/admin-listing-queue.model';
import * as AdminModerationActions from './admin-moderation.actions';
import {
  initialAdminModerationState,
  type AdminModerationRollbackEntry,
  type AdminModerationState,
} from './admin-moderation.state';

export const adminModerationFeatureKey = 'adminModeration' as const;

function addActionId(ids: string[], listingId: string): string[] {
  return ids.includes(listingId) ? ids : [...ids, listingId];
}

function removeActionId(ids: string[], listingId: string): string[] {
  return ids.filter((id) => id !== listingId);
}

function removeAt<T>(items: T[], index: number): T[] {
  return [...items.slice(0, index), ...items.slice(index + 1)];
}

function insertAt<T>(items: T[], index: number, value: T): T[] {
  const clampedIndex = Math.max(0, Math.min(index, items.length));
  return [...items.slice(0, clampedIndex), value, ...items.slice(clampedIndex)];
}

function patchItem(
  items: AdminListingSummary[],
  listingId: string,
  patch: Partial<AdminListingSummary>,
): AdminListingSummary[] {
  return items.map((item) => (item.id === listingId ? { ...item, ...patch } : item));
}

function withoutRollback(
  rollbacks: Record<string, AdminModerationRollbackEntry>,
  listingId: string,
): Record<string, AdminModerationRollbackEntry> {
  const { [listingId]: _removed, ...rest } = rollbacks;
  return rest;
}

/** Moves one unit of `counts` from `from` to `to` (Pending → Approved/Rejected). */
function shiftCounts(
  counts: AdminListingQueueCounts,
  from: keyof AdminListingQueueCounts,
  to: keyof AdminListingQueueCounts,
): AdminListingQueueCounts {
  return { ...counts, [from]: Math.max(0, counts[from] - 1), [to]: counts[to] + 1 };
}

/** Shared shape for the approve/reject "optimistic request" reducer case. */
function beginDecision(
  state: AdminModerationState,
  listingId: string,
  toCountsKey: 'approved' | 'rejected',
): AdminModerationState {
  const index = state.items.findIndex((item) => item.id === listingId);
  const item = index >= 0 ? state.items[index] : null;
  // The row only leaves the visible list when it stops belonging on the
  // current tab — i.e. when reviewing the Pending tab (approve/reject both
  // move a listing off of Pending). Acting from elsewhere (e.g. the inspect
  // page before the queue was ever loaded) just patches counts.
  const nextItems =
    index >= 0 && state.statusFilter === 'Pending' ? removeAt(state.items, index) : state.items;
  return {
    ...state,
    items: nextItems,
    counts: shiftCounts(state.counts, 'pending', toCountsKey),
    actionIds: addActionId(state.actionIds, listingId),
    rollbacks: {
      ...state.rollbacks,
      [listingId]: { item, index, counts: state.counts, detailCategory: null },
    },
    error: null,
  };
}

/** Shared shape for approve/reject failure — restores the row and counts. */
function rollbackDecision(
  state: AdminModerationState,
  listingId: string,
  error: string,
): AdminModerationState {
  const rollback = state.rollbacks[listingId];
  const rollbacks = withoutRollback(state.rollbacks, listingId);
  if (!rollback) {
    return { ...state, actionIds: removeActionId(state.actionIds, listingId), rollbacks, error };
  }
  const alreadyPresent = state.items.some((item) => item.id === listingId);
  const items =
    rollback.item !== null && !alreadyPresent
      ? insertAt(state.items, rollback.index, rollback.item)
      : state.items;
  return {
    ...state,
    items,
    counts: rollback.counts,
    actionIds: removeActionId(state.actionIds, listingId),
    rollbacks,
    error,
  };
}

export const adminModerationReducer = createReducer(
  initialAdminModerationState,

  // ── Queue ──
  on(
    AdminModerationActions.loadListingQueue,
    (state): AdminModerationState => ({ ...state, isLoading: true, error: null }),
  ),
  on(
    AdminModerationActions.loadListingQueueSuccess,
    (state, { queue }): AdminModerationState => ({
      ...state,
      items: queue.items,
      page: queue.page,
      pageSize: queue.pageSize,
      totalCount: queue.totalCount,
      totalPages: queue.totalPages,
      counts: queue.counts,
      isLoading: false,
      error: null,
    }),
  ),
  on(
    AdminModerationActions.loadListingQueueFailure,
    (state, { error }): AdminModerationState => ({ ...state, isLoading: false, error }),
  ),
  on(
    AdminModerationActions.setQueueStatusFilter,
    (state, { status }): AdminModerationState => ({ ...state, statusFilter: status, page: 1 }),
  ),
  on(
    AdminModerationActions.setQueuePage,
    (state, { page }): AdminModerationState => ({ ...state, page }),
  ),

  // ── Approve (optimistic) ──
  on(
    AdminModerationActions.approveListing,
    (state, { listingId }): AdminModerationState => beginDecision(state, listingId, 'approved'),
  ),
  on(
    AdminModerationActions.approveListingSuccess,
    (state, { listingId }): AdminModerationState => ({
      ...state,
      actionIds: removeActionId(state.actionIds, listingId),
      rollbacks: withoutRollback(state.rollbacks, listingId),
    }),
  ),
  on(
    AdminModerationActions.approveListingFailure,
    (state, { listingId, error }): AdminModerationState =>
      rollbackDecision(state, listingId, error),
  ),

  // ── Reject (optimistic) ──
  on(
    AdminModerationActions.rejectListing,
    (state, { listingId }): AdminModerationState => beginDecision(state, listingId, 'rejected'),
  ),
  on(
    AdminModerationActions.rejectListingSuccess,
    (state, { listingId }): AdminModerationState => ({
      ...state,
      actionIds: removeActionId(state.actionIds, listingId),
      rollbacks: withoutRollback(state.rollbacks, listingId),
    }),
  ),
  on(
    AdminModerationActions.rejectListingFailure,
    (state, { listingId, error }): AdminModerationState =>
      rollbackDecision(state, listingId, error),
  ),

  // ── Recategorise (optimistic; doesn't move rows between tabs) ──
  on(
    AdminModerationActions.updateListingCategory,
    (state, { listingId, categoryId, categoryName }): AdminModerationState => {
      const index = state.items.findIndex((item) => item.id === listingId);
      const previous = index >= 0 ? state.items[index] : null;
      const previousDetailCategory =
        state.detail && state.detail.id === listingId
          ? { categoryId: state.detail.categoryId, categoryName: state.detail.categoryName }
          : null;
      return {
        ...state,
        items: patchItem(state.items, listingId, { categoryId, categoryName }),
        detail:
          state.detail && state.detail.id === listingId
            ? { ...state.detail, categoryId, categoryName }
            : state.detail,
        actionIds: addActionId(state.actionIds, listingId),
        rollbacks: {
          ...state.rollbacks,
          [listingId]: {
            item: previous,
            index,
            counts: state.counts,
            detailCategory: previousDetailCategory,
          },
        },
        error: null,
      };
    },
  ),
  on(
    AdminModerationActions.updateListingCategorySuccess,
    (state, { listingId, detail }): AdminModerationState => ({
      ...state,
      items: patchItem(state.items, listingId, {
        categoryId: detail.categoryId,
        categoryName: detail.categoryName,
        suggestedCategoryId: detail.suggestedCategoryId,
        suggestedCategoryName: detail.suggestedCategoryName,
      }),
      detail: state.detail && state.detail.id === listingId ? detail : state.detail,
      actionIds: removeActionId(state.actionIds, listingId),
      rollbacks: withoutRollback(state.rollbacks, listingId),
    }),
  ),
  on(
    AdminModerationActions.updateListingCategoryFailure,
    (state, { listingId, error }): AdminModerationState => {
      const rollback = state.rollbacks[listingId];
      const rollbacks = withoutRollback(state.rollbacks, listingId);
      // Restoring `detail` does not depend on the row having been loaded in `items` — an
      // admin who deep-linked straight to `/admin/review/:id` has `items: []` but a
      // populated `detail`, and that dossier must roll back too. See
      // `AdminModerationRollbackEntry.detailCategory`'s doc comment.
      const detail =
        rollback?.detailCategory && state.detail && state.detail.id === listingId
          ? { ...state.detail, ...rollback.detailCategory }
          : state.detail;
      if (!rollback?.item) {
        return {
          ...state,
          detail,
          actionIds: removeActionId(state.actionIds, listingId),
          rollbacks,
          error,
        };
      }
      const restore = {
        categoryId: rollback.item.categoryId,
        categoryName: rollback.item.categoryName,
      };
      return {
        ...state,
        items: patchItem(state.items, listingId, restore),
        detail,
        actionIds: removeActionId(state.actionIds, listingId),
        rollbacks,
        error,
      };
    },
  ),

  // ── Detail ──
  on(
    AdminModerationActions.loadListingDetail,
    (state): AdminModerationState => ({ ...state, isDetailLoading: true, detailError: null }),
  ),
  on(
    AdminModerationActions.loadListingDetailSuccess,
    (state, { detail }): AdminModerationState => ({
      ...state,
      detail,
      detailListingId: detail.id,
      isDetailLoading: false,
      detailError: null,
    }),
  ),
  on(
    AdminModerationActions.loadListingDetailFailure,
    (state, { error }): AdminModerationState => ({
      ...state,
      isDetailLoading: false,
      detailError: error,
    }),
  ),
  on(
    AdminModerationActions.clearListingDetail,
    (state): AdminModerationState => ({
      ...state,
      detail: null,
      detailListingId: null,
      detailError: null,
    }),
  ),
);
