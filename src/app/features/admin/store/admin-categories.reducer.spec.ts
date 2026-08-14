import { makeAdminCategory } from '../../../../testing/fixtures';
import * as AdminCategoriesActions from './admin-categories.actions';
import { adminCategoriesReducer } from './admin-categories.reducer';
import { initialAdminCategoriesState, type AdminCategoriesState } from './admin-categories.state';

function stateWith(overrides: Partial<AdminCategoriesState>): AdminCategoriesState {
  return { ...initialAdminCategoriesState, ...overrides };
}

describe('adminCategoriesReducer', () => {
  describe('load', () => {
    it('replaces items and summary on success', () => {
      const items = [makeAdminCategory({ id: 'c1' }), makeAdminCategory({ id: 'c2' })];
      const next = adminCategoriesReducer(
        stateWith({ isLoading: true }),
        AdminCategoriesActions.loadCategoriesSuccess({
          list: {
            items,
            summary: { totalCategories: 2, visibleCount: 2, totalListedToys: 5 },
          },
        }),
      );
      expect(next.items).toEqual(items);
      expect(next.summary).toEqual({ totalCategories: 2, visibleCount: 2, totalListedToys: 5 });
      expect(next.isLoading).toBe(false);
      expect(next.error).toBeNull();
    });

    it('records the error on failure', () => {
      const next = adminCategoriesReducer(
        stateWith({ isLoading: true }),
        AdminCategoriesActions.loadCategoriesFailure({ error: 'boom' }),
      );
      expect(next.isLoading).toBe(false);
      expect(next.error).toBe('boom');
    });
  });

  describe('create (optimistic)', () => {
    it('inserts a placeholder row keyed by tempId and bumps the summary', () => {
      const start = stateWith({
        items: [makeAdminCategory({ id: 'c1' })],
        summary: { totalCategories: 1, visibleCount: 1, totalListedToys: 0 },
      });
      const next = adminCategoriesReducer(
        start,
        AdminCategoriesActions.createCategory({
          tempId: 'temp-1',
          request: { name: 'Outdoor', iconName: 'glob', colorHex: '#D9F0EC' },
        }),
      );
      expect(next.items.map((i) => i.id)).toEqual(['c1', 'temp-1']);
      const placeholder = next.items[1];
      expect(placeholder.name).toBe('Outdoor');
      expect(placeholder.iconName).toBe('glob');
      expect(placeholder.colorHex).toBe('#D9F0EC');
      expect(placeholder.isVisible).toBe(true);
      expect(next.summary).toEqual({ totalCategories: 2, visibleCount: 2, totalListedToys: 0 });
      expect(next.isCreating).toBe(true);
      expect(next.rollbacks['temp-1']).toBeDefined();
    });

    it('replaces the placeholder with the confirmed category on success', () => {
      const start = adminCategoriesReducer(
        stateWith({ items: [] }),
        AdminCategoriesActions.createCategory({
          tempId: 'temp-1',
          request: { name: 'Outdoor' },
        }),
      );
      const confirmed = makeAdminCategory({ id: 'c-real', name: 'Outdoor' });
      const next = adminCategoriesReducer(
        start,
        AdminCategoriesActions.createCategorySuccess({ tempId: 'temp-1', category: confirmed }),
      );
      expect(next.items).toEqual([confirmed]);
      expect(next.isCreating).toBe(false);
      expect(next.rollbacks['temp-1']).toBeUndefined();
    });

    it('removes the placeholder and restores the summary on failure', () => {
      const start = adminCategoriesReducer(
        stateWith({
          items: [makeAdminCategory({ id: 'c1' })],
          summary: { totalCategories: 1, visibleCount: 1, totalListedToys: 0 },
        }),
        AdminCategoriesActions.createCategory({ tempId: 'temp-1', request: { name: 'Outdoor' } }),
      );
      const next = adminCategoriesReducer(
        start,
        AdminCategoriesActions.createCategoryFailure({
          tempId: 'temp-1',
          error: 'nope',
          errorCode: 'admin.category_name_taken',
        }),
      );
      expect(next.items.map((i) => i.id)).toEqual(['c1']);
      expect(next.summary).toEqual({ totalCategories: 1, visibleCount: 1, totalListedToys: 0 });
      expect(next.isCreating).toBe(false);
      expect(next.createErrorCode).toBe('admin.category_name_taken');
      expect(next.rollbacks['temp-1']).toBeUndefined();
    });
  });

  describe('update (rename/restyle, optimistic)', () => {
    it('patches the row immediately, honouring omitted-vs-empty-string semantics', () => {
      const start = stateWith({
        items: [makeAdminCategory({ id: 'c1', name: 'Old', iconName: 'tag', colorHex: '#FFE6CC' })],
      });
      const next = adminCategoriesReducer(
        start,
        AdminCategoriesActions.updateCategory({
          id: 'c1',
          request: { name: 'New', iconName: '' },
        }),
      );
      expect(next.items[0].name).toBe('New');
      expect(next.items[0].iconName).toBeNull();
      expect(next.items[0].colorHex).toBe('#FFE6CC');
      expect(next.actionIds).toEqual(['c1']);
      expect(next.rollbacks['c1']).toBeDefined();
    });

    it('restores the row and records the error code on failure', () => {
      const original = makeAdminCategory({ id: 'c1', name: 'Old' });
      const start = adminCategoriesReducer(
        stateWith({ items: [original] }),
        AdminCategoriesActions.updateCategory({ id: 'c1', request: { name: 'New' } }),
      );
      const next = adminCategoriesReducer(
        start,
        AdminCategoriesActions.updateCategoryFailure({
          id: 'c1',
          error: 'taken',
          errorCode: 'admin.category_name_taken',
        }),
      );
      expect(next.items[0]).toEqual(original);
      expect(next.actionIds).toEqual([]);
      expect(next.editErrorCodeById['c1']).toBe('admin.category_name_taken');
    });
  });

  describe('visibility toggle (optimistic)', () => {
    it('flips isVisible and adjusts visibleCount immediately', () => {
      const start = stateWith({
        items: [makeAdminCategory({ id: 'c1', isVisible: true })],
        summary: { totalCategories: 1, visibleCount: 1, totalListedToys: 0 },
      });
      const next = adminCategoriesReducer(
        start,
        AdminCategoriesActions.updateVisibility({ id: 'c1', isVisible: false }),
      );
      expect(next.items[0].isVisible).toBe(false);
      expect(next.summary.visibleCount).toBe(0);
    });

    it('restores the row and summary on failure', () => {
      const start = adminCategoriesReducer(
        stateWith({
          items: [makeAdminCategory({ id: 'c1', isVisible: true })],
          summary: { totalCategories: 1, visibleCount: 1, totalListedToys: 0 },
        }),
        AdminCategoriesActions.updateVisibility({ id: 'c1', isVisible: false }),
      );
      const next = adminCategoriesReducer(
        start,
        AdminCategoriesActions.updateVisibilityFailure({ id: 'c1', error: 'denied' }),
      );
      expect(next.items[0].isVisible).toBe(true);
      expect(next.summary.visibleCount).toBe(1);
      expect(next.error).toBe('denied');
    });
  });

  describe('reorder (optimistic; full id list)', () => {
    it('reorders items immediately to match orderedIds', () => {
      const start = stateWith({
        items: [
          makeAdminCategory({ id: 'c1' }),
          makeAdminCategory({ id: 'c2' }),
          makeAdminCategory({ id: 'c3' }),
        ],
      });
      const next = adminCategoriesReducer(
        start,
        AdminCategoriesActions.reorderCategories({ orderedIds: ['c2', 'c3', 'c1'] }),
      );
      expect(next.items.map((i) => i.id)).toEqual(['c2', 'c3', 'c1']);
      expect(next.isReordering).toBe(true);
      expect(next.savedOrder).toEqual(['c1', 'c2', 'c3']);
    });

    it('restores the previous order on failure', () => {
      const start = adminCategoriesReducer(
        stateWith({
          items: [makeAdminCategory({ id: 'c1' }), makeAdminCategory({ id: 'c2' })],
        }),
        AdminCategoriesActions.reorderCategories({ orderedIds: ['c2', 'c1'] }),
      );
      const next = adminCategoriesReducer(
        start,
        AdminCategoriesActions.reorderCategoriesFailure({ error: 'mismatch' }),
      );
      expect(next.items.map((i) => i.id)).toEqual(['c1', 'c2']);
      expect(next.isReordering).toBe(false);
      expect(next.reorderError).toBe('mismatch');
      expect(next.savedOrder).toBeNull();
    });

    it('replaces items with the server-confirmed order on success', () => {
      const start = adminCategoriesReducer(
        stateWith({
          items: [makeAdminCategory({ id: 'c1' }), makeAdminCategory({ id: 'c2' })],
        }),
        AdminCategoriesActions.reorderCategories({ orderedIds: ['c2', 'c1'] }),
      );
      const confirmed = [
        makeAdminCategory({ id: 'c2', displayOrder: 0 }),
        makeAdminCategory({ id: 'c1', displayOrder: 1 }),
      ];
      const next = adminCategoriesReducer(
        start,
        AdminCategoriesActions.reorderCategoriesSuccess({ categories: confirmed }),
      );
      expect(next.items).toEqual(confirmed);
      expect(next.isReordering).toBe(false);
    });
  });

  describe('delete (non-optimistic)', () => {
    it('marks the id as deleting on dispatch', () => {
      const next = adminCategoriesReducer(
        stateWith({}),
        AdminCategoriesActions.deleteCategory({ id: 'c1' }),
      );
      expect(next.deletingId).toBe('c1');
      expect(next.deleteError).toBeNull();
    });

    it('removes the item and clears deletingId on success', () => {
      const start = stateWith({
        items: [makeAdminCategory({ id: 'c1' }), makeAdminCategory({ id: 'c2' })],
        deletingId: 'c1',
      });
      const next = adminCategoriesReducer(
        start,
        AdminCategoriesActions.deleteCategorySuccess({ id: 'c1' }),
      );
      expect(next.items.map((i) => i.id)).toEqual(['c2']);
      expect(next.deletingId).toBeNull();
    });

    it('clears deletingId and records the error code on failure (e.g. reassign required)', () => {
      const start = stateWith({ deletingId: 'c1' });
      const next = adminCategoriesReducer(
        start,
        AdminCategoriesActions.deleteCategoryFailure({
          id: 'c1',
          error: 'has listings',
          errorCode: 'admin.category_reassign_required',
        }),
      );
      expect(next.deletingId).toBeNull();
      expect(next.deleteError).toBe('has listings');
      expect(next.deleteErrorCode).toBe('admin.category_reassign_required');
    });

    it('surfaces a partial-failure error without claiming the category is gone', () => {
      const start = stateWith({
        items: [makeAdminCategory({ id: 'c1' })],
        deletingId: 'c1',
      });
      const next = adminCategoriesReducer(
        start,
        AdminCategoriesActions.deleteCategoryToNewCategoryPartialFailure({
          id: 'c1',
          createdCategoryId: 'new-cat',
          error: 'delete step failed',
        }),
      );
      // The old category was never removed from local state by this action — only a
      // successful deleteCategorySuccess (or the subsequent refetch) does that.
      expect(next.items.map((i) => i.id)).toEqual(['c1']);
      expect(next.deletingId).toBeNull();
      expect(next.deleteError).toBe('delete step failed');
    });
  });
});
