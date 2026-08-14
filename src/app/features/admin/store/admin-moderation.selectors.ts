import { createFeatureSelector, createSelector } from '@ngrx/store';

import type {
  AdminListingDetail,
  AdminListingQueueCounts,
  AdminListingQueueParams,
  AdminListingQueueStatusFilter,
  AdminListingSummary,
} from '../models/admin-listing-queue.model';
import { adminModerationFeatureKey } from './admin-moderation.reducer';
import type { AdminModerationState } from './admin-moderation.state';

export const selectAdminModerationState =
  createFeatureSelector<AdminModerationState>(adminModerationFeatureKey);

// ── Queue ──
export const selectQueueItems = createSelector(
  selectAdminModerationState,
  (state: AdminModerationState): AdminListingSummary[] => state.items,
);

export const selectQueueStatusFilter = createSelector(
  selectAdminModerationState,
  (state: AdminModerationState): AdminListingQueueStatusFilter => state.statusFilter,
);

export const selectQueuePage = createSelector(
  selectAdminModerationState,
  (state: AdminModerationState): number => state.page,
);

export const selectQueuePageSize = createSelector(
  selectAdminModerationState,
  (state: AdminModerationState): number => state.pageSize,
);

export const selectQueueTotalCount = createSelector(
  selectAdminModerationState,
  (state: AdminModerationState): number => state.totalCount,
);

export const selectQueueTotalPages = createSelector(
  selectAdminModerationState,
  (state: AdminModerationState): number => state.totalPages,
);

export const selectQueueCounts = createSelector(
  selectAdminModerationState,
  (state: AdminModerationState): AdminListingQueueCounts => state.counts,
);

export const selectQueueLoading = createSelector(
  selectAdminModerationState,
  (state: AdminModerationState): boolean => state.isLoading,
);

export const selectQueueError = createSelector(
  selectAdminModerationState,
  (state: AdminModerationState): string | null => state.error,
);

export const selectQueueActionIds = createSelector(
  selectAdminModerationState,
  (state: AdminModerationState): string[] => state.actionIds,
);

/** What the queue effect actually requests with — kept as one selector so the
 * initial load, tab switches, and page changes all funnel through the same
 * request shape. */
export const selectQueueRequestParams = createSelector(
  selectQueueStatusFilter,
  selectQueuePage,
  selectQueuePageSize,
  (status, page, pageSize): AdminListingQueueParams => ({ status, page, pageSize }),
);

// ── Detail (inspect-page) ──
export const selectListingDetail = createSelector(
  selectAdminModerationState,
  (state: AdminModerationState): AdminListingDetail | null => state.detail,
);

export const selectListingDetailListingId = createSelector(
  selectAdminModerationState,
  (state: AdminModerationState): string | null => state.detailListingId,
);

export const selectListingDetailLoading = createSelector(
  selectAdminModerationState,
  (state: AdminModerationState): boolean => state.isDetailLoading,
);

export const selectListingDetailError = createSelector(
  selectAdminModerationState,
  (state: AdminModerationState): string | null => state.detailError,
);
