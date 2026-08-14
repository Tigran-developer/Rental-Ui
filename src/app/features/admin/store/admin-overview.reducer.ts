import { createReducer, on } from '@ngrx/store';

import * as AdminOverviewActions from './admin-overview.actions';
import { initialAdminOverviewState, type AdminOverviewState } from './admin-overview.state';

export const adminOverviewFeatureKey = 'adminOverview' as const;

export const adminOverviewReducer = createReducer(
  initialAdminOverviewState,

  // ── Overview ──
  on(
    AdminOverviewActions.loadOverview,
    (state): AdminOverviewState => ({ ...state, isLoadingOverview: true, overviewError: null }),
  ),
  on(
    AdminOverviewActions.loadOverviewSuccess,
    (state, { overview }): AdminOverviewState => ({
      ...state,
      overview,
      isLoadingOverview: false,
      overviewError: null,
    }),
  ),
  on(
    AdminOverviewActions.loadOverviewFailure,
    (state, { error }): AdminOverviewState => ({
      ...state,
      isLoadingOverview: false,
      overviewError: error,
    }),
  ),

  // ── Activity feed ──
  on(
    AdminOverviewActions.loadActivityFeed,
    (state): AdminOverviewState => ({ ...state, isLoadingActivity: true, activityError: null }),
  ),
  on(
    AdminOverviewActions.loadActivityFeedSuccess,
    (state, { feed }): AdminOverviewState => ({
      ...state,
      activity: feed.items,
      isLoadingActivity: false,
      activityError: null,
    }),
  ),
  on(
    AdminOverviewActions.loadActivityFeedFailure,
    (state, { error }): AdminOverviewState => ({
      ...state,
      isLoadingActivity: false,
      activityError: error,
    }),
  ),
);
