import { createReducer, on } from '@ngrx/store';

import type { AdminUser, AdminUserStatusFilter } from '../models/admin-user.model';
import * as AdminUsersActions from './admin-users.actions';
import {
  initialAdminUsersState,
  type AdminUsersRollbackEntry,
  type AdminUsersState,
} from './admin-users.state';

export const adminUsersFeatureKey = 'adminUsers' as const;

function addActionId(ids: string[], userId: string): string[] {
  return ids.includes(userId) ? ids : [...ids, userId];
}

function removeActionId(ids: string[], userId: string): string[] {
  return ids.filter((id) => id !== userId);
}

function removeAt<T>(items: T[], index: number): T[] {
  return [...items.slice(0, index), ...items.slice(index + 1)];
}

function insertAt<T>(items: T[], index: number, value: T): T[] {
  const clampedIndex = Math.max(0, Math.min(index, items.length));
  return [...items.slice(0, clampedIndex), value, ...items.slice(clampedIndex)];
}

function withoutRollback(
  rollbacks: Record<string, AdminUsersRollbackEntry>,
  userId: string,
): Record<string, AdminUsersRollbackEntry> {
  const { [userId]: _removed, ...rest } = rollbacks;
  return rest;
}

/** `all` matches every row; `pending`/`suspended` mirror the row's derived `status` — same
 *  convention as `AdminUserStatusFilter`'s doc comment (`active` is a row status, not a
 *  filter value). */
function matchesStatusFilter(item: AdminUser, filter: AdminUserStatusFilter): boolean {
  if (filter === 'pending') return item.status === 'Pending';
  if (filter === 'suspended') return item.status === 'Suspended';
  return true;
}

/**
 * Shared shape for the verify/suspend/reactivate "optimistic request" reducer case.
 * `patchFn` computes the optimistic field changes from the row's current values (e.g. verify
 * only flips `status` to Active when it was Pending — mirrors the design's `verify()`). The
 * row leaves the visible list the moment it stops matching the current tab (e.g. suspending a
 * row while viewing "Pending ID" removes it), exactly like `AdminModerationEffects`'
 * `beginDecision`.
 */
function beginMutation(
  state: AdminUsersState,
  userId: string,
  patchFn: (item: AdminUser) => Partial<AdminUser>,
): AdminUsersState {
  const index = state.items.findIndex((item) => item.id === userId);
  if (index === -1) {
    // Not loaded locally (e.g. dispatched from a profile dialog whose row already scrolled
    // out of the current page) — nothing to optimistically patch or roll back.
    return { ...state, actionIds: addActionId(state.actionIds, userId), error: null };
  }
  const original = state.items[index];
  const patched: AdminUser = { ...original, ...patchFn(original) };
  const stillMatches = matchesStatusFilter(patched, state.statusFilter);
  const nextItems = stillMatches
    ? state.items.map((item, i) => (i === index ? patched : item))
    : removeAt(state.items, index);
  return {
    ...state,
    items: nextItems,
    actionIds: addActionId(state.actionIds, userId),
    rollbacks: { ...state.rollbacks, [userId]: { item: original, index } },
    error: null,
  };
}

/** Shared shape for verify/suspend/reactivate failure — restores the row exactly as it was. */
function rollbackMutation(state: AdminUsersState, userId: string, error: string): AdminUsersState {
  const rollback = state.rollbacks[userId];
  const rollbacks = withoutRollback(state.rollbacks, userId);
  if (!rollback) {
    return { ...state, actionIds: removeActionId(state.actionIds, userId), rollbacks, error };
  }
  const index = state.items.findIndex((item) => item.id === userId);
  const items =
    index >= 0
      ? state.items.map((item, i) => (i === index ? rollback.item : item))
      : insertAt(state.items, rollback.index, rollback.item);
  return {
    ...state,
    items,
    actionIds: removeActionId(state.actionIds, userId),
    rollbacks,
    error,
  };
}

/** Shared shape for verify/suspend/reactivate success — applies the server's authoritative
 *  row (fresh `flagCount`/`status`/etc.) rather than trusting the optimistic guess, same
 *  idiom as `AdminModerationActions.updateListingCategorySuccess`. */
function settleMutationSuccess(
  state: AdminUsersState,
  userId: string,
  user: AdminUser,
): AdminUsersState {
  const index = state.items.findIndex((item) => item.id === userId);
  const items =
    index === -1
      ? state.items
      : matchesStatusFilter(user, state.statusFilter)
        ? state.items.map((item, i) => (i === index ? user : item))
        : removeAt(state.items, index);
  return {
    ...state,
    items,
    actionIds: removeActionId(state.actionIds, userId),
    rollbacks: withoutRollback(state.rollbacks, userId),
  };
}

export const adminUsersReducer = createReducer(
  initialAdminUsersState,

  // ── Queue ──
  on(
    AdminUsersActions.loadUserQueue,
    (state): AdminUsersState => ({ ...state, isLoading: true, error: null }),
  ),
  on(
    AdminUsersActions.loadUserQueueSuccess,
    (state, { queue }): AdminUsersState => ({
      ...state,
      items: queue.items,
      page: queue.page,
      pageSize: queue.pageSize,
      totalCount: queue.totalCount,
      totalPages: queue.totalPages,
      summary: queue.summary,
      isLoading: false,
      error: null,
    }),
  ),
  on(
    AdminUsersActions.loadUserQueueFailure,
    (state, { error }): AdminUsersState => ({ ...state, isLoading: false, error }),
  ),
  on(
    AdminUsersActions.setUserStatusFilter,
    (state, { status }): AdminUsersState => ({ ...state, statusFilter: status, page: 1 }),
  ),
  on(
    AdminUsersActions.setUserSearch,
    (state, { search }): AdminUsersState => ({ ...state, search, page: 1 }),
  ),
  on(
    AdminUsersActions.setUserSort,
    (state, { sort }): AdminUsersState => ({ ...state, sort, page: 1 }),
  ),
  on(AdminUsersActions.setUserPage, (state, { page }): AdminUsersState => ({ ...state, page })),

  // ── Verify (optimistic) ──
  on(
    AdminUsersActions.verifyUser,
    (state, { userId }): AdminUsersState =>
      beginMutation(state, userId, (item) => ({
        isIdConfirmed: true,
        status: item.status === 'Pending' ? 'Active' : item.status,
      })),
  ),
  on(
    AdminUsersActions.verifyUserSuccess,
    (state, { userId, user }): AdminUsersState => settleMutationSuccess(state, userId, user),
  ),
  on(
    AdminUsersActions.verifyUserFailure,
    (state, { userId, error }): AdminUsersState => rollbackMutation(state, userId, error),
  ),

  // ── Suspend (optimistic) ──
  on(
    AdminUsersActions.suspendUser,
    (state, { userId }): AdminUsersState =>
      beginMutation(state, userId, () => ({ status: 'Suspended' })),
  ),
  on(
    AdminUsersActions.suspendUserSuccess,
    (state, { userId, user }): AdminUsersState => settleMutationSuccess(state, userId, user),
  ),
  on(
    AdminUsersActions.suspendUserFailure,
    (state, { userId, error }): AdminUsersState => rollbackMutation(state, userId, error),
  ),

  // ── Reactivate (optimistic) ──
  on(
    AdminUsersActions.reactivateUser,
    (state, { userId }): AdminUsersState =>
      beginMutation(state, userId, (item) => ({
        status: item.isIdConfirmed ? 'Active' : 'Pending',
      })),
  ),
  on(
    AdminUsersActions.reactivateUserSuccess,
    (state, { userId, user }): AdminUsersState => settleMutationSuccess(state, userId, user),
  ),
  on(
    AdminUsersActions.reactivateUserFailure,
    (state, { userId, error }): AdminUsersState => rollbackMutation(state, userId, error),
  ),
);
