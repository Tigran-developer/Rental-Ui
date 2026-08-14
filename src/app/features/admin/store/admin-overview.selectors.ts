import { createFeatureSelector, createSelector } from '@ngrx/store';

import type { AdminActivityItem, AdminOverview } from '../models/admin-overview.model';
import { adminOverviewFeatureKey } from './admin-overview.reducer';
import type { AdminOverviewState } from './admin-overview.state';

export const selectAdminOverviewState =
  createFeatureSelector<AdminOverviewState>(adminOverviewFeatureKey);

export const selectOverview = createSelector(
  selectAdminOverviewState,
  (state: AdminOverviewState): AdminOverview | null => state.overview,
);

export const selectOverviewLoading = createSelector(
  selectAdminOverviewState,
  (state: AdminOverviewState): boolean => state.isLoadingOverview,
);

export const selectOverviewError = createSelector(
  selectAdminOverviewState,
  (state: AdminOverviewState): string | null => state.overviewError,
);

export const selectActivityItems = createSelector(
  selectAdminOverviewState,
  (state: AdminOverviewState): AdminActivityItem[] => state.activity,
);

export const selectActivityLoading = createSelector(
  selectAdminOverviewState,
  (state: AdminOverviewState): boolean => state.isLoadingActivity,
);

export const selectActivityError = createSelector(
  selectAdminOverviewState,
  (state: AdminOverviewState): string | null => state.activityError,
);
