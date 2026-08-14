import { createFeatureSelector, createSelector } from '@ngrx/store';

import type {
  AdminUser,
  AdminUserQueueParams,
  AdminUserQueueSummary,
  AdminUserSortOption,
  AdminUserStatusFilter,
} from '../models/admin-user.model';
import { adminUsersFeatureKey } from './admin-users.reducer';
import type { AdminUsersState } from './admin-users.state';

export const selectAdminUsersState = createFeatureSelector<AdminUsersState>(adminUsersFeatureKey);

export const selectUserItems = createSelector(
  selectAdminUsersState,
  (state: AdminUsersState): AdminUser[] => state.items,
);

export const selectUserStatusFilter = createSelector(
  selectAdminUsersState,
  (state: AdminUsersState): AdminUserStatusFilter => state.statusFilter,
);

export const selectUserSearch = createSelector(
  selectAdminUsersState,
  (state: AdminUsersState): string => state.search,
);

export const selectUserSort = createSelector(
  selectAdminUsersState,
  (state: AdminUsersState): AdminUserSortOption => state.sort,
);

export const selectUserPage = createSelector(
  selectAdminUsersState,
  (state: AdminUsersState): number => state.page,
);

export const selectUserPageSize = createSelector(
  selectAdminUsersState,
  (state: AdminUsersState): number => state.pageSize,
);

export const selectUserTotalCount = createSelector(
  selectAdminUsersState,
  (state: AdminUsersState): number => state.totalCount,
);

export const selectUserTotalPages = createSelector(
  selectAdminUsersState,
  (state: AdminUsersState): number => state.totalPages,
);

export const selectUserSummary = createSelector(
  selectAdminUsersState,
  (state: AdminUsersState): AdminUserQueueSummary => state.summary,
);

export const selectUserLoading = createSelector(
  selectAdminUsersState,
  (state: AdminUsersState): boolean => state.isLoading,
);

export const selectUserError = createSelector(
  selectAdminUsersState,
  (state: AdminUsersState): string | null => state.error,
);

export const selectUserActionIds = createSelector(
  selectAdminUsersState,
  (state: AdminUsersState): string[] => state.actionIds,
);

/** What the queue effect actually requests with — the initial load, tab switches, search
 *  debounce, sort changes, and page changes all funnel through the same request shape, same
 *  idiom as `AdminModerationEffects`' `selectQueueRequestParams`. */
export const selectUserRequestParams = createSelector(
  selectUserStatusFilter,
  selectUserSearch,
  selectUserSort,
  selectUserPage,
  selectUserPageSize,
  (status, search, sort, page, pageSize): AdminUserQueueParams => ({
    status,
    search,
    sort,
    page,
    pageSize,
  }),
);
