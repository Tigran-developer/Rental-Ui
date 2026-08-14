import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { actionsHarness, collect } from '../../../../testing/ngrx.helpers';
import { makeAdminActivityItem, makeAdminOverview } from '../../../../testing/fixtures';
import { AdminOverviewApiService } from '../services/admin-overview-api.service';
import * as AdminOverviewActions from './admin-overview.actions';
import { AdminOverviewEffects } from './admin-overview.effects';

function setup(api: Partial<AdminOverviewApiService> = {}) {
  const harness = actionsHarness();
  TestBed.configureTestingModule({
    providers: [
      AdminOverviewEffects,
      harness.provider,
      { provide: AdminOverviewApiService, useValue: api },
    ],
  });
  return { harness, effects: TestBed.inject(AdminOverviewEffects) };
}

describe('AdminOverviewEffects', () => {
  describe('loadOverview$', () => {
    it('emits success with the overview from the API', async () => {
      const overview = makeAdminOverview();
      const getOverview = vi.fn().mockReturnValue(of(overview));
      const { harness, effects } = setup({ getOverview });
      const result = collect(effects.loadOverview$);
      harness.send(AdminOverviewActions.loadOverview());
      harness.complete();
      expect(await result).toEqual([AdminOverviewActions.loadOverviewSuccess({ overview })]);
    });

    it('emits failure with a message on error', async () => {
      const { harness, effects } = setup({
        getOverview: vi.fn().mockReturnValue(throwError(() => new Error('boom'))),
      });
      const result = collect(effects.loadOverview$);
      harness.send(AdminOverviewActions.loadOverview());
      harness.complete();
      expect(await result).toEqual([AdminOverviewActions.loadOverviewFailure({ error: 'boom' })]);
    });
  });

  describe('loadActivityFeed$', () => {
    it('passes params through and emits success with the feed', async () => {
      const feed = { items: [makeAdminActivityItem()] };
      const getActivityFeed = vi.fn().mockReturnValue(of(feed));
      const { harness, effects } = setup({ getActivityFeed });
      const result = collect(effects.loadActivityFeed$);
      harness.send(AdminOverviewActions.loadActivityFeed({ params: { take: 8 } }));
      harness.complete();
      expect(await result).toEqual([AdminOverviewActions.loadActivityFeedSuccess({ feed })]);
      expect(getActivityFeed).toHaveBeenCalledWith({ take: 8 });
    });

    it('emits failure with a message on error', async () => {
      const { harness, effects } = setup({
        getActivityFeed: vi.fn().mockReturnValue(throwError(() => new Error('boom'))),
      });
      const result = collect(effects.loadActivityFeed$);
      harness.send(AdminOverviewActions.loadActivityFeed({}));
      harness.complete();
      expect(await result).toEqual([
        AdminOverviewActions.loadActivityFeedFailure({ error: 'boom' }),
      ]);
    });
  });
});
