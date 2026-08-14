import { makeAdminActivityItem, makeAdminOverview } from '../../../../testing/fixtures';
import * as AdminOverviewActions from './admin-overview.actions';
import { adminOverviewReducer } from './admin-overview.reducer';
import { initialAdminOverviewState, type AdminOverviewState } from './admin-overview.state';

function stateWith(overrides: Partial<AdminOverviewState>): AdminOverviewState {
  return { ...initialAdminOverviewState, ...overrides };
}

describe('adminOverviewReducer', () => {
  describe('overview', () => {
    it('sets isLoadingOverview on load and clears any previous error', () => {
      const next = adminOverviewReducer(
        stateWith({ overviewError: 'boom' }),
        AdminOverviewActions.loadOverview(),
      );
      expect(next.isLoadingOverview).toBe(true);
      expect(next.overviewError).toBeNull();
    });

    it('stores the overview and clears loading/error on success', () => {
      const overview = makeAdminOverview({ awaitingReviewCount: 7 });
      const next = adminOverviewReducer(
        stateWith({ isLoadingOverview: true }),
        AdminOverviewActions.loadOverviewSuccess({ overview }),
      );
      expect(next.overview).toEqual(overview);
      expect(next.isLoadingOverview).toBe(false);
      expect(next.overviewError).toBeNull();
    });

    it('records the error and clears loading on failure, keeping any prior overview', () => {
      const overview = makeAdminOverview();
      const next = adminOverviewReducer(
        stateWith({ overview, isLoadingOverview: true }),
        AdminOverviewActions.loadOverviewFailure({ error: 'network down' }),
      );
      expect(next.isLoadingOverview).toBe(false);
      expect(next.overviewError).toBe('network down');
      expect(next.overview).toEqual(overview);
    });
  });

  describe('activity feed', () => {
    it('sets isLoadingActivity on load and clears any previous error', () => {
      const next = adminOverviewReducer(
        stateWith({ activityError: 'boom' }),
        AdminOverviewActions.loadActivityFeed({}),
      );
      expect(next.isLoadingActivity).toBe(true);
      expect(next.activityError).toBeNull();
    });

    it('replaces the activity list and clears loading/error on success', () => {
      const items = [makeAdminActivityItem({ id: 'a1' }), makeAdminActivityItem({ id: 'a2' })];
      const next = adminOverviewReducer(
        stateWith({ isLoadingActivity: true }),
        AdminOverviewActions.loadActivityFeedSuccess({ feed: { items } }),
      );
      expect(next.activity).toEqual(items);
      expect(next.isLoadingActivity).toBe(false);
      expect(next.activityError).toBeNull();
    });

    it('records the error and clears loading on failure', () => {
      const next = adminOverviewReducer(
        stateWith({ isLoadingActivity: true }),
        AdminOverviewActions.loadActivityFeedFailure({ error: 'boom' }),
      );
      expect(next.isLoadingActivity).toBe(false);
      expect(next.activityError).toBe('boom');
    });
  });
});
