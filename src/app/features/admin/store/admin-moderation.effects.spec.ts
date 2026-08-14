import { TestBed } from '@angular/core/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';

import { actionsHarness, collect } from '../../../../testing/ngrx.helpers';
import { makeAdminListingDetail, makeAdminListingSummary } from '../../../../testing/fixtures';
import { AdminListingsApiService } from '../services/admin-listings-api.service';
import { adminModerationFeatureKey } from './admin-moderation.reducer';
import { initialAdminModerationState } from './admin-moderation.state';
import * as AdminModerationActions from './admin-moderation.actions';
import { AdminModerationEffects } from './admin-moderation.effects';

function setup(api: Partial<AdminListingsApiService> = {}) {
  const harness = actionsHarness();
  const messageService = { add: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      AdminModerationEffects,
      harness.provider,
      provideMockStore({
        initialState: { [adminModerationFeatureKey]: initialAdminModerationState },
      }),
      { provide: AdminListingsApiService, useValue: api },
      { provide: MessageService, useValue: messageService },
      { provide: TranslateService, useValue: { instant: (k: string) => k } },
    ],
  });
  return { harness, messageService, effects: TestBed.inject(AdminModerationEffects) };
}

describe('AdminModerationEffects', () => {
  it('loads the queue using the current request params', async () => {
    const queue = {
      items: [makeAdminListingSummary()],
      page: 1,
      pageSize: 20,
      totalCount: 1,
      totalPages: 1,
      counts: { pending: 1, approved: 0, rejected: 0 },
    };
    const getListingQueue = vi.fn().mockReturnValue(of(queue));
    const { harness, effects } = setup({ getListingQueue });
    const result = collect(effects.loadListingQueue$);
    harness.send(AdminModerationActions.loadListingQueue());
    harness.complete();
    expect(await result).toEqual([AdminModerationActions.loadListingQueueSuccess({ queue })]);
    expect(getListingQueue).toHaveBeenCalledWith({ status: 'Pending', page: 1, pageSize: 20 });
  });

  it('re-dispatches loadListingQueue on tab/page changes', async () => {
    const { harness, effects } = setup();
    const result = collect(effects.reloadOnFilterChange$);
    harness.send(AdminModerationActions.setQueueStatusFilter({ status: 'Approved' }));
    harness.send(AdminModerationActions.setQueuePage({ page: 2 }));
    harness.complete();
    expect(await result).toEqual([
      AdminModerationActions.loadListingQueue(),
      AdminModerationActions.loadListingQueue(),
    ]);
  });

  it('re-dispatches loadListingQueue after a successful decision (counts refetch)', async () => {
    const { harness, effects } = setup();
    const result = collect(effects.refetchAfterDecision$);
    harness.send(AdminModerationActions.approveListingSuccess({ listingId: 'p1' }));
    harness.send(AdminModerationActions.rejectListingSuccess({ listingId: 'p2' }));
    harness.complete();
    expect(await result).toEqual([
      AdminModerationActions.loadListingQueue(),
      AdminModerationActions.loadListingQueue(),
    ]);
  });

  describe('approve', () => {
    it('emits success with the listing id', async () => {
      const { harness, effects } = setup({
        approveListing: vi.fn().mockReturnValue(of(undefined)),
      });
      const result = collect(effects.approveListing$);
      harness.send(AdminModerationActions.approveListing({ listingId: 'p1' }));
      harness.complete();
      expect(await result).toEqual([
        AdminModerationActions.approveListingSuccess({ listingId: 'p1' }),
      ]);
    });

    it('emits failure carrying the listing id and a normalized error', async () => {
      const { harness, effects } = setup({
        approveListing: vi.fn().mockReturnValue(throwError(() => new Error('denied'))),
      });
      const result = collect(effects.approveListing$);
      harness.send(AdminModerationActions.approveListing({ listingId: 'p1' }));
      harness.complete();
      expect(await result).toEqual([
        AdminModerationActions.approveListingFailure({ listingId: 'p1', error: 'denied' }),
      ]);
    });
  });

  it('reject forwards the reason and note and emits success', async () => {
    const rejectListing = vi.fn().mockReturnValue(of(undefined));
    const { harness, effects } = setup({ rejectListing });
    const result = collect(effects.rejectListing$);
    harness.send(
      AdminModerationActions.rejectListing({ listingId: 'p1', reasonCode: 'spam', note: 'x' }),
    );
    harness.complete();
    expect(await result).toEqual([
      AdminModerationActions.rejectListingSuccess({ listingId: 'p1' }),
    ]);
    expect(rejectListing).toHaveBeenCalledWith('p1', 'spam', 'x');
  });

  describe('updateListingCategory', () => {
    it('emits success with the returned detail', async () => {
      const detail = makeAdminListingDetail({ id: 'p1', categoryId: 'cat-2' });
      const { harness, effects } = setup({
        updateListingCategory: vi.fn().mockReturnValue(of(detail)),
      });
      const result = collect(effects.updateListingCategory$);
      harness.send(
        AdminModerationActions.updateListingCategory({
          listingId: 'p1',
          categoryId: 'cat-2',
          categoryName: 'New',
        }),
      );
      harness.complete();
      expect(await result).toEqual([
        AdminModerationActions.updateListingCategorySuccess({ listingId: 'p1', detail }),
      ]);
    });

    it('emits failure on error', async () => {
      const { harness, effects } = setup({
        updateListingCategory: vi.fn().mockReturnValue(throwError(() => new Error('nope'))),
      });
      const result = collect(effects.updateListingCategory$);
      harness.send(
        AdminModerationActions.updateListingCategory({
          listingId: 'p1',
          categoryId: 'cat-2',
          categoryName: 'New',
        }),
      );
      harness.complete();
      expect(await result).toEqual([
        AdminModerationActions.updateListingCategoryFailure({ listingId: 'p1', error: 'nope' }),
      ]);
    });
  });

  it('loads the listing detail', async () => {
    const detail = makeAdminListingDetail({ id: 'p1' });
    const { harness, effects } = setup({ getListingDetail: vi.fn().mockReturnValue(of(detail)) });
    const result = collect(effects.loadListingDetail$);
    harness.send(AdminModerationActions.loadListingDetail({ listingId: 'p1' }));
    harness.complete();
    expect(await result).toEqual([AdminModerationActions.loadListingDetailSuccess({ detail })]);
  });

  describe('toasts', () => {
    it('shows a success toast after an approval', () => {
      const { harness, messageService, effects } = setup();
      effects.approveSuccess$.subscribe();
      harness.send(AdminModerationActions.approveListingSuccess({ listingId: 'p1' }));
      expect(messageService.add).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'success' }),
      );
    });

    it('shows an error toast carrying the failure detail', () => {
      const { harness, messageService, effects } = setup();
      effects.actionFailure$.subscribe();
      harness.send(AdminModerationActions.rejectListingFailure({ listingId: 'p1', error: 'boom' }));
      expect(messageService.add).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error', detail: 'boom' }),
      );
    });

    it('shows an error toast for a failed recategorise', () => {
      const { harness, messageService, effects } = setup();
      effects.actionFailure$.subscribe();
      harness.send(
        AdminModerationActions.updateListingCategoryFailure({
          listingId: 'p1',
          error: 'category boom',
        }),
      );
      expect(messageService.add).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error', detail: 'category boom' }),
      );
    });
  });
});
