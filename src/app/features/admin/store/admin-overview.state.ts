import type { AdminActivityItem, AdminOverview } from '../models/admin-overview.model';

/**
 * Admin console Phase 5/6: the Overview screen's stat tiles/CTA/"Queue health" panel plus the
 * recent-moderation activity feed. Two independent loads (`overview` and `activity`) — the
 * former is also consumed by `AdminShellComponent`'s rail badges/queue-health panel, which is
 * why `overview`/`isLoadingOverview` exist on their own rather than being folded into a single
 * "is this screen loading" flag: the shell reads them without ever touching `activity`.
 */
export interface AdminOverviewState {
  readonly overview: AdminOverview | null;
  readonly isLoadingOverview: boolean;
  readonly overviewError: string | null;

  readonly activity: AdminActivityItem[];
  readonly isLoadingActivity: boolean;
  readonly activityError: string | null;
}

export const initialAdminOverviewState: AdminOverviewState = {
  overview: null,
  isLoadingOverview: false,
  overviewError: null,

  activity: [],
  isLoadingActivity: false,
  activityError: null,
};
