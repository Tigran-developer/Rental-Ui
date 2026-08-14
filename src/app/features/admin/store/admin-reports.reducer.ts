import { createReducer, on } from '@ngrx/store';

import type { AdminReportQueueStatusFilter, AdminReportRow } from '../models/admin-report.model';
import * as AdminReportsActions from './admin-reports.actions';
import {
  initialAdminReportsState,
  type AdminReportsRollbackEntry,
  type AdminReportsState,
} from './admin-reports.state';

export const adminReportsFeatureKey = 'adminReports' as const;

function addActionId(ids: string[], reportId: string): string[] {
  return ids.includes(reportId) ? ids : [...ids, reportId];
}

function removeActionId(ids: string[], reportId: string): string[] {
  return ids.filter((id) => id !== reportId);
}

function removeAt<T>(items: T[], index: number): T[] {
  return [...items.slice(0, index), ...items.slice(index + 1)];
}

function insertAt<T>(items: T[], index: number, value: T): T[] {
  const clampedIndex = Math.max(0, Math.min(index, items.length));
  return [...items.slice(0, clampedIndex), value, ...items.slice(clampedIndex)];
}

function withoutRollback(
  rollbacks: Record<string, AdminReportsRollbackEntry>,
  reportId: string,
): Record<string, AdminReportsRollbackEntry> {
  const { [reportId]: _removed, ...rest } = rollbacks;
  return rest;
}

/** `all` matches every row; `open`/`resolved`/`dismissed` mirror the row's `status` — same
 *  convention as `AdminUsersReducer`'s `matchesStatusFilter`. */
function matchesStatusFilter(item: AdminReportRow, filter: AdminReportQueueStatusFilter): boolean {
  if (filter === 'open') return item.status === 'Open';
  if (filter === 'resolved') return item.status === 'Resolved';
  if (filter === 'dismissed') return item.status === 'Dismissed';
  return true;
}

/**
 * Shared shape for the resolve/dismiss/reopen "optimistic request" reducer case. The row
 * leaves the visible list the moment it stops matching the current tab, exactly like
 * `AdminUsersReducer.beginMutation`.
 */
function beginMutation(
  state: AdminReportsState,
  reportId: string,
  patchFn: (item: AdminReportRow) => Partial<AdminReportRow>,
): AdminReportsState {
  const index = state.items.findIndex((item) => item.id === reportId);
  if (index === -1) {
    return { ...state, actionIds: addActionId(state.actionIds, reportId), error: null };
  }
  const original = state.items[index];
  const patched: AdminReportRow = { ...original, ...patchFn(original) };
  const stillMatches = matchesStatusFilter(patched, state.statusFilter);
  const nextItems = stillMatches
    ? state.items.map((item, i) => (i === index ? patched : item))
    : removeAt(state.items, index);
  return {
    ...state,
    items: nextItems,
    actionIds: addActionId(state.actionIds, reportId),
    rollbacks: { ...state.rollbacks, [reportId]: { item: original, index } },
    error: null,
  };
}

/** Shared shape for resolve/dismiss/reopen failure — restores the row exactly as it was. */
function rollbackMutation(
  state: AdminReportsState,
  reportId: string,
  error: string,
): AdminReportsState {
  const rollback = state.rollbacks[reportId];
  const rollbacks = withoutRollback(state.rollbacks, reportId);
  if (!rollback) {
    return { ...state, actionIds: removeActionId(state.actionIds, reportId), rollbacks, error };
  }
  const index = state.items.findIndex((item) => item.id === reportId);
  const items =
    index >= 0
      ? state.items.map((item, i) => (i === index ? rollback.item : item))
      : insertAt(state.items, rollback.index, rollback.item);
  return {
    ...state,
    items,
    actionIds: removeActionId(state.actionIds, reportId),
    rollbacks,
    error,
  };
}

/** Shared shape for resolve/dismiss/reopen success — applies the server's authoritative row
 *  (fresh `resolvedAt`/`resolutionNote`/`status`) rather than trusting the optimistic guess. */
function settleMutationSuccess(
  state: AdminReportsState,
  reportId: string,
  report: AdminReportRow,
): AdminReportsState {
  const index = state.items.findIndex((item) => item.id === reportId);
  const items =
    index === -1
      ? state.items
      : matchesStatusFilter(report, state.statusFilter)
        ? state.items.map((item, i) => (i === index ? report : item))
        : removeAt(state.items, index);
  return {
    ...state,
    items,
    actionIds: removeActionId(state.actionIds, reportId),
    rollbacks: withoutRollback(state.rollbacks, reportId),
  };
}

export const adminReportsReducer = createReducer(
  initialAdminReportsState,

  // ── Queue ──
  on(
    AdminReportsActions.loadReportQueue,
    (state): AdminReportsState => ({ ...state, isLoading: true, error: null }),
  ),
  on(
    AdminReportsActions.loadReportQueueSuccess,
    (state, { queue }): AdminReportsState => ({
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
    AdminReportsActions.loadReportQueueFailure,
    (state, { error }): AdminReportsState => ({ ...state, isLoading: false, error }),
  ),
  on(
    AdminReportsActions.setReportStatusFilter,
    (state, { status }): AdminReportsState => ({ ...state, statusFilter: status, page: 1 }),
  ),
  on(
    AdminReportsActions.setReportSearch,
    (state, { search }): AdminReportsState => ({ ...state, search, page: 1 }),
  ),
  on(
    AdminReportsActions.setReportTargetFilter,
    (state, { targetFilter }): AdminReportsState => ({ ...state, targetFilter, page: 1 }),
  ),
  on(
    AdminReportsActions.setReportPage,
    (state, { page }): AdminReportsState => ({ ...state, page }),
  ),

  // ── Resolve (optimistic) ──
  on(
    AdminReportsActions.resolveReport,
    (state, { reportId }): AdminReportsState =>
      beginMutation(state, reportId, () => ({ status: 'Resolved' })),
  ),
  on(
    AdminReportsActions.resolveReportSuccess,
    (state, { reportId, report }): AdminReportsState =>
      settleMutationSuccess(state, reportId, report),
  ),
  on(
    AdminReportsActions.resolveReportFailure,
    (state, { reportId, error }): AdminReportsState => rollbackMutation(state, reportId, error),
  ),

  // ── Dismiss (optimistic) ──
  on(
    AdminReportsActions.dismissReport,
    (state, { reportId }): AdminReportsState =>
      beginMutation(state, reportId, () => ({ status: 'Dismissed' })),
  ),
  on(
    AdminReportsActions.dismissReportSuccess,
    (state, { reportId, report }): AdminReportsState =>
      settleMutationSuccess(state, reportId, report),
  ),
  on(
    AdminReportsActions.dismissReportFailure,
    (state, { reportId, error }): AdminReportsState => rollbackMutation(state, reportId, error),
  ),

  // ── Reopen (optimistic) ──
  on(
    AdminReportsActions.reopenReport,
    (state, { reportId }): AdminReportsState =>
      beginMutation(state, reportId, () => ({ status: 'Open' })),
  ),
  on(
    AdminReportsActions.reopenReportSuccess,
    (state, { reportId, report }): AdminReportsState =>
      settleMutationSuccess(state, reportId, report),
  ),
  on(
    AdminReportsActions.reopenReportFailure,
    (state, { reportId, error }): AdminReportsState => rollbackMutation(state, reportId, error),
  ),
);
