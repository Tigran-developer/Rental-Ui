import { makeAdminListingDetail, makeAdminListingSummary } from '../../../../testing/fixtures';
import type { AdminListingQueue } from '../models/admin-listing-queue.model';
import * as AdminModerationActions from './admin-moderation.actions';
import { adminModerationReducer } from './admin-moderation.reducer';
import { initialAdminModerationState, type AdminModerationState } from './admin-moderation.state';

function stateWith(overrides: Partial<AdminModerationState>): AdminModerationState {
  return { ...initialAdminModerationState, ...overrides };
}

function queueWith(overrides: Partial<AdminListingQueue> = {}): AdminListingQueue {
  return {
    items: [],
    page: 1,
    pageSize: 20,
    totalCount: 0,
    totalPages: 0,
    counts: { pending: 0, approved: 0, rejected: 0 },
    ...overrides,
  };
}

describe('adminModerationReducer', () => {
  describe('queue load', () => {
    it('replaces the queue and counts on success', () => {
      const items = [makeAdminListingSummary({ id: 'p1' }), makeAdminListingSummary({ id: 'p2' })];
      const next = adminModerationReducer(
        stateWith({ isLoading: true }),
        AdminModerationActions.loadListingQueueSuccess({
          queue: queueWith({
            items,
            totalCount: 2,
            totalPages: 1,
            counts: { pending: 2, approved: 0, rejected: 0 },
          }),
        }),
      );
      expect(next.items).toEqual(items);
      expect(next.counts).toEqual({ pending: 2, approved: 0, rejected: 0 });
      expect(next.isLoading).toBe(false);
      expect(next.error).toBeNull();
    });

    it('records the error on failure', () => {
      const next = adminModerationReducer(
        stateWith({ isLoading: true }),
        AdminModerationActions.loadListingQueueFailure({ error: 'boom' }),
      );
      expect(next.isLoading).toBe(false);
      expect(next.error).toBe('boom');
    });

    it('resets to page 1 when the status filter changes', () => {
      const next = adminModerationReducer(
        stateWith({ page: 3, statusFilter: 'Pending' }),
        AdminModerationActions.setQueueStatusFilter({ status: 'Approved' }),
      );
      expect(next.statusFilter).toBe('Approved');
      expect(next.page).toBe(1);
    });

    it('sets the page', () => {
      const next = adminModerationReducer(
        initialAdminModerationState,
        AdminModerationActions.setQueuePage({ page: 2 }),
      );
      expect(next.page).toBe(2);
    });
  });

  describe('approve (optimistic)', () => {
    it('removes the row from the Pending tab immediately and shifts counts', () => {
      const start = stateWith({
        statusFilter: 'Pending',
        items: [makeAdminListingSummary({ id: 'p1' }), makeAdminListingSummary({ id: 'p2' })],
        counts: { pending: 2, approved: 0, rejected: 0 },
      });
      const next = adminModerationReducer(
        start,
        AdminModerationActions.approveListing({ listingId: 'p1' }),
      );
      expect(next.items.map((i) => i.id)).toEqual(['p2']);
      expect(next.counts).toEqual({ pending: 1, approved: 1, rejected: 0 });
      expect(next.actionIds).toEqual(['p1']);
      expect(next.rollbacks['p1']).toBeDefined();
    });

    it('clears the rollback entry and action id on success', () => {
      const start = adminModerationReducer(
        stateWith({
          statusFilter: 'Pending',
          items: [makeAdminListingSummary({ id: 'p1' })],
          counts: { pending: 1, approved: 0, rejected: 0 },
        }),
        AdminModerationActions.approveListing({ listingId: 'p1' }),
      );
      const next = adminModerationReducer(
        start,
        AdminModerationActions.approveListingSuccess({ listingId: 'p1' }),
      );
      expect(next.actionIds).toEqual([]);
      expect(next.rollbacks['p1']).toBeUndefined();
    });

    it('re-inserts the row and restores counts on failure', () => {
      const original = makeAdminListingSummary({ id: 'p1' });
      const start = adminModerationReducer(
        stateWith({
          statusFilter: 'Pending',
          items: [original, makeAdminListingSummary({ id: 'p2' })],
          counts: { pending: 2, approved: 0, rejected: 0 },
        }),
        AdminModerationActions.approveListing({ listingId: 'p1' }),
      );
      const next = adminModerationReducer(
        start,
        AdminModerationActions.approveListingFailure({ listingId: 'p1', error: 'nope' }),
      );
      expect(next.items.map((i) => i.id)).toEqual(['p1', 'p2']);
      expect(next.counts).toEqual({ pending: 2, approved: 0, rejected: 0 });
      expect(next.actionIds).toEqual([]);
      expect(next.error).toBe('nope');
      expect(next.rollbacks['p1']).toBeUndefined();
    });
  });

  describe('reject (optimistic)', () => {
    it('removes the row and shifts counts to rejected', () => {
      const start = stateWith({
        statusFilter: 'Pending',
        items: [makeAdminListingSummary({ id: 'p1' })],
        counts: { pending: 1, approved: 0, rejected: 0 },
      });
      const next = adminModerationReducer(
        start,
        AdminModerationActions.rejectListing({
          listingId: 'p1',
          reasonCode: 'poorImages',
          note: '',
        }),
      );
      expect(next.items).toEqual([]);
      expect(next.counts).toEqual({ pending: 0, approved: 0, rejected: 1 });
    });

    it('does not remove the row when the current tab is not Pending', () => {
      const start = stateWith({
        statusFilter: 'Approved',
        items: [makeAdminListingSummary({ id: 'p1' })],
        counts: { pending: 1, approved: 1, rejected: 0 },
      });
      const next = adminModerationReducer(
        start,
        AdminModerationActions.rejectListing({
          listingId: 'p1',
          reasonCode: 'poorImages',
          note: '',
        }),
      );
      expect(next.items.map((i) => i.id)).toEqual(['p1']);
    });
  });

  describe('recategorise (optimistic)', () => {
    it('patches the item and the loaded detail, without touching counts', () => {
      const start = stateWith({
        items: [makeAdminListingSummary({ id: 'p1', categoryId: 'old', categoryName: 'Old' })],
        detail: makeAdminListingDetail({ id: 'p1', categoryId: 'old', categoryName: 'Old' }),
        counts: { pending: 1, approved: 0, rejected: 0 },
      });
      const next = adminModerationReducer(
        start,
        AdminModerationActions.updateListingCategory({
          listingId: 'p1',
          categoryId: 'new',
          categoryName: 'New',
        }),
      );
      expect(next.items[0].categoryId).toBe('new');
      expect(next.detail?.categoryName).toBe('New');
      expect(next.counts).toEqual({ pending: 1, approved: 0, rejected: 0 });
    });

    it('restores the previous category on failure', () => {
      const start = adminModerationReducer(
        stateWith({
          items: [makeAdminListingSummary({ id: 'p1', categoryId: 'old', categoryName: 'Old' })],
        }),
        AdminModerationActions.updateListingCategory({
          listingId: 'p1',
          categoryId: 'new',
          categoryName: 'New',
        }),
      );
      const next = adminModerationReducer(
        start,
        AdminModerationActions.updateListingCategoryFailure({ listingId: 'p1', error: 'nope' }),
      );
      expect(next.items[0].categoryId).toBe('old');
      expect(next.items[0].categoryName).toBe('Old');
      expect(next.error).toBe('nope');
    });

    it('restores the detail dossier on failure even when the row was never loaded into items (deep-link path)', () => {
      // Regression for the deep-link path: an admin opens /admin/review/:id directly (refresh,
      // bookmark, or a link from elsewhere) so review-page's ngOnInit never ran and `items` is
      // still []. `detail` is populated from the detail load. Applying a category change that
      // then fails must roll the dossier's category back even though there's no matching row in
      // `items` to key off of.
      const start = adminModerationReducer(
        stateWith({
          items: [],
          detail: makeAdminListingDetail({ id: 'p1', categoryId: 'old', categoryName: 'Old' }),
        }),
        AdminModerationActions.updateListingCategory({
          listingId: 'p1',
          categoryId: 'new',
          categoryName: 'New',
        }),
      );
      expect(start.detail?.categoryId).toBe('new');

      const next = adminModerationReducer(
        start,
        AdminModerationActions.updateListingCategoryFailure({ listingId: 'p1', error: 'nope' }),
      );
      expect(next.detail?.categoryId).toBe('old');
      expect(next.detail?.categoryName).toBe('Old');
      expect(next.error).toBe('nope');
    });

    it('applies the server response on success', () => {
      const start = adminModerationReducer(
        stateWith({
          items: [makeAdminListingSummary({ id: 'p1', categoryId: 'old', categoryName: 'Old' })],
        }),
        AdminModerationActions.updateListingCategory({
          listingId: 'p1',
          categoryId: 'new',
          categoryName: 'New',
        }),
      );
      const detail = makeAdminListingDetail({
        id: 'p1',
        categoryId: 'new',
        categoryName: 'New (server)',
      });
      const next = adminModerationReducer(
        start,
        AdminModerationActions.updateListingCategorySuccess({ listingId: 'p1', detail }),
      );
      expect(next.items[0].categoryName).toBe('New (server)');
      expect(next.rollbacks['p1']).toBeUndefined();
    });

    it('carries the freshly-recomputed suggestion fields onto the list item on success', () => {
      const start = adminModerationReducer(
        stateWith({
          items: [
            makeAdminListingSummary({
              id: 'p1',
              categoryId: 'old',
              categoryName: 'Old',
              suggestedCategoryId: null,
              suggestedCategoryName: null,
            }),
          ],
        }),
        AdminModerationActions.updateListingCategory({
          listingId: 'p1',
          categoryId: 'puzzles',
          categoryName: 'Puzzles',
        }),
      );
      const detail = makeAdminListingDetail({
        id: 'p1',
        categoryId: 'puzzles',
        categoryName: 'Puzzles',
        suggestedCategoryId: 'tricycles',
        suggestedCategoryName: 'Tricycles',
      });
      const next = adminModerationReducer(
        start,
        AdminModerationActions.updateListingCategorySuccess({ listingId: 'p1', detail }),
      );
      expect(next.items[0].suggestedCategoryId).toBe('tricycles');
      expect(next.items[0].suggestedCategoryName).toBe('Tricycles');
    });

    it('clears a stale suggestion on the list item when recategorising to the suggested category', () => {
      const start = adminModerationReducer(
        stateWith({
          items: [
            makeAdminListingSummary({
              id: 'p1',
              categoryId: 'puzzles',
              categoryName: 'Puzzles',
              suggestedCategoryId: 'tricycles',
              suggestedCategoryName: 'Tricycles',
            }),
          ],
        }),
        AdminModerationActions.updateListingCategory({
          listingId: 'p1',
          categoryId: 'tricycles',
          categoryName: 'Tricycles',
        }),
      );
      const detail = makeAdminListingDetail({
        id: 'p1',
        categoryId: 'tricycles',
        categoryName: 'Tricycles',
        suggestedCategoryId: null,
        suggestedCategoryName: null,
      });
      const next = adminModerationReducer(
        start,
        AdminModerationActions.updateListingCategorySuccess({ listingId: 'p1', detail }),
      );
      expect(next.items[0].suggestedCategoryId).toBeNull();
      expect(next.items[0].suggestedCategoryName).toBeNull();
    });
  });

  describe('detail', () => {
    it('loads and clears the dossier', () => {
      const detail = makeAdminListingDetail({ id: 'd1' });
      const loaded = adminModerationReducer(
        stateWith({ isDetailLoading: true }),
        AdminModerationActions.loadListingDetailSuccess({ detail }),
      );
      expect(loaded.detail).toEqual(detail);
      expect(loaded.detailListingId).toBe('d1');
      expect(loaded.isDetailLoading).toBe(false);

      const cleared = adminModerationReducer(loaded, AdminModerationActions.clearListingDetail());
      expect(cleared.detail).toBeNull();
      expect(cleared.detailListingId).toBeNull();
    });

    it('records the error on failure', () => {
      const next = adminModerationReducer(
        stateWith({ isDetailLoading: true }),
        AdminModerationActions.loadListingDetailFailure({ error: 'not found' }),
      );
      expect(next.isDetailLoading).toBe(false);
      expect(next.detailError).toBe('not found');
    });
  });
});
