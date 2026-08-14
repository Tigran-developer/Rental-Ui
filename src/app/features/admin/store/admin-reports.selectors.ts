import { createFeatureSelector, createSelector } from '@ngrx/store';

import type {
  AdminReportQueueCounts,
  AdminReportQueueParams,
  AdminReportQueueStatusFilter,
  AdminReportRow,
} from '../models/admin-report.model';
import { adminReportsFeatureKey } from './admin-reports.reducer';
import type { AdminReportsState, AdminReportsTargetFilter } from './admin-reports.state';

export const selectAdminReportsState =
  createFeatureSelector<AdminReportsState>(adminReportsFeatureKey);

export const selectReportItems = createSelector(
  selectAdminReportsState,
  (state: AdminReportsState): AdminReportRow[] => state.items,
);

export const selectReportStatusFilter = createSelector(
  selectAdminReportsState,
  (state: AdminReportsState): AdminReportQueueStatusFilter => state.statusFilter,
);

export const selectReportSearch = createSelector(
  selectAdminReportsState,
  (state: AdminReportsState): string => state.search,
);

export const selectReportTargetFilter = createSelector(
  selectAdminReportsState,
  (state: AdminReportsState): AdminReportsTargetFilter | null => state.targetFilter,
);

export const selectReportPage = createSelector(
  selectAdminReportsState,
  (state: AdminReportsState): number => state.page,
);

export const selectReportPageSize = createSelector(
  selectAdminReportsState,
  (state: AdminReportsState): number => state.pageSize,
);

export const selectReportTotalCount = createSelector(
  selectAdminReportsState,
  (state: AdminReportsState): number => state.totalCount,
);

export const selectReportTotalPages = createSelector(
  selectAdminReportsState,
  (state: AdminReportsState): number => state.totalPages,
);

export const selectReportCounts = createSelector(
  selectAdminReportsState,
  (state: AdminReportsState): AdminReportQueueCounts => state.counts,
);

export const selectReportLoading = createSelector(
  selectAdminReportsState,
  (state: AdminReportsState): boolean => state.isLoading,
);

export const selectReportError = createSelector(
  selectAdminReportsState,
  (state: AdminReportsState): string | null => state.error,
);

export const selectReportActionIds = createSelector(
  selectAdminReportsState,
  (state: AdminReportsState): string[] => state.actionIds,
);

/** What the queue effect actually requests with — the initial load, tab switches, search
 *  debounce, target-filter changes, and page changes all funnel through the same request
 *  shape, same idiom as `AdminUsersSelectors.selectUserRequestParams`. */
export const selectReportRequestParams = createSelector(
  selectReportStatusFilter,
  selectReportSearch,
  selectReportTargetFilter,
  selectReportPage,
  selectReportPageSize,
  (status, search, targetFilter, page, pageSize): AdminReportQueueParams => ({
    status,
    search,
    ...(targetFilter
      ? { targetType: targetFilter.targetType, targetId: targetFilter.targetId }
      : {}),
    page,
    pageSize,
  }),
);
