import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';

import { makeAdminCategory } from '../../../../testing/fixtures';
import { actionsHarness, collect } from '../../../../testing/ngrx.helpers';
import { AdminCategoriesApiService } from '../services/admin-categories-api.service';
import * as AdminCategoriesActions from './admin-categories.actions';
import { AdminCategoriesEffects } from './admin-categories.effects';

function setup(api: Partial<AdminCategoriesApiService> = {}) {
  const harness = actionsHarness();
  const messageService = { add: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      AdminCategoriesEffects,
      harness.provider,
      { provide: AdminCategoriesApiService, useValue: api },
      { provide: MessageService, useValue: messageService },
      { provide: TranslateService, useValue: { instant: (k: string) => k } },
    ],
  });
  return { harness, messageService, effects: TestBed.inject(AdminCategoriesEffects) };
}

function nameTakenError(): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 409,
    error: { errorCode: 'admin.category_name_taken', title: 'taken' },
  });
}

describe('AdminCategoriesEffects', () => {
  it('loads categories', async () => {
    const list = {
      items: [makeAdminCategory()],
      summary: { totalCategories: 1, visibleCount: 1, totalListedToys: 0 },
    };
    const getCategories = vi.fn().mockReturnValue(of(list));
    const { harness, effects } = setup({ getCategories });
    const result = collect(effects.loadCategories$);
    harness.send(AdminCategoriesActions.loadCategories());
    harness.complete();
    expect(await result).toEqual([AdminCategoriesActions.loadCategoriesSuccess({ list })]);
  });

  it('refetches after every settled mutation', async () => {
    const { harness, effects } = setup();
    const result = collect(effects.refetchAfterMutation$);
    harness.send(
      AdminCategoriesActions.createCategorySuccess({
        tempId: 't1',
        category: makeAdminCategory(),
      }),
    );
    harness.send(
      AdminCategoriesActions.deleteCategoryToNewCategoryPartialFailure({
        id: 'c1',
        createdCategoryId: 'c2',
        error: 'boom',
      }),
    );
    harness.complete();
    expect(await result).toEqual([
      AdminCategoriesActions.loadCategories(),
      AdminCategoriesActions.loadCategories(),
    ]);
  });

  describe('createCategory$', () => {
    it('emits success with the tempId and confirmed category', async () => {
      const category = makeAdminCategory({ id: 'c-real' });
      const { harness, effects } = setup({
        createCategory: vi.fn().mockReturnValue(of(category)),
      });
      const result = collect(effects.createCategory$);
      harness.send(
        AdminCategoriesActions.createCategory({ tempId: 't1', request: { name: 'Outdoor' } }),
      );
      harness.complete();
      expect(await result).toEqual([
        AdminCategoriesActions.createCategorySuccess({ tempId: 't1', category }),
      ]);
    });

    it('emits failure carrying the tempId and the errorCode', async () => {
      const { harness, effects } = setup({
        createCategory: vi.fn().mockReturnValue(throwError(() => nameTakenError())),
      });
      const result = collect(effects.createCategory$);
      harness.send(
        AdminCategoriesActions.createCategory({ tempId: 't1', request: { name: 'Outdoor' } }),
      );
      harness.complete();
      expect(await result).toEqual([
        AdminCategoriesActions.createCategoryFailure({
          tempId: 't1',
          error: 'taken',
          errorCode: 'admin.category_name_taken',
        }),
      ]);
    });
  });

  describe('reorderCategories$', () => {
    it('sends the full ordered id list and emits the confirmed order', async () => {
      const categories = [makeAdminCategory({ id: 'c2' }), makeAdminCategory({ id: 'c1' })];
      const reorderCategories = vi.fn().mockReturnValue(of(categories));
      const { harness, effects } = setup({ reorderCategories });
      const result = collect(effects.reorderCategories$);
      harness.send(AdminCategoriesActions.reorderCategories({ orderedIds: ['c2', 'c1'] }));
      harness.complete();
      expect(reorderCategories).toHaveBeenCalledWith(['c2', 'c1']);
      expect(await result).toEqual([
        AdminCategoriesActions.reorderCategoriesSuccess({ categories }),
      ]);
    });
  });

  describe('deleteCategoryToNewCategory$', () => {
    it('creates the new category, then deletes the old one targeting it', async () => {
      const created = makeAdminCategory({ id: 'new-cat', name: 'Brand New' });
      const createCategory = vi.fn().mockReturnValue(of(created));
      const deleteCategory = vi.fn().mockReturnValue(of(undefined));
      const { harness, effects } = setup({ createCategory, deleteCategory });
      const result = collect(effects.deleteCategoryToNewCategory$);
      harness.send(
        AdminCategoriesActions.deleteCategoryToNewCategory({
          id: 'old-cat',
          newCategory: { name: 'Brand New' },
        }),
      );
      harness.complete();
      expect(createCategory).toHaveBeenCalledWith({ name: 'Brand New' });
      expect(deleteCategory).toHaveBeenCalledWith('old-cat', 'new-cat');
      expect(await result).toEqual([
        AdminCategoriesActions.deleteCategorySuccess({ id: 'old-cat' }),
      ]);
    });

    it('emits deleteCategoryFailure when the create step fails (nothing was created)', async () => {
      const createCategory = vi.fn().mockReturnValue(throwError(() => new Error('down')));
      const { harness, effects } = setup({ createCategory });
      const result = collect(effects.deleteCategoryToNewCategory$);
      harness.send(
        AdminCategoriesActions.deleteCategoryToNewCategory({
          id: 'old-cat',
          newCategory: { name: 'Brand New' },
        }),
      );
      harness.complete();
      expect(await result).toEqual([
        AdminCategoriesActions.deleteCategoryFailure({
          id: 'old-cat',
          error: 'down',
          errorCode: null,
        }),
      ]);
    });

    it('emits a partial-failure action (carrying the created id) when the delete step fails', async () => {
      const created = makeAdminCategory({ id: 'new-cat' });
      const createCategory = vi.fn().mockReturnValue(of(created));
      const deleteCategory = vi.fn().mockReturnValue(throwError(() => new Error('locked')));
      const { harness, effects } = setup({ createCategory, deleteCategory });
      const result = collect(effects.deleteCategoryToNewCategory$);
      harness.send(
        AdminCategoriesActions.deleteCategoryToNewCategory({
          id: 'old-cat',
          newCategory: { name: 'Brand New' },
        }),
      );
      harness.complete();
      expect(await result).toEqual([
        AdminCategoriesActions.deleteCategoryToNewCategoryPartialFailure({
          id: 'old-cat',
          createdCategoryId: 'new-cat',
          error: 'locked',
        }),
      ]);
    });
  });

  describe('toasts', () => {
    it('does not toast a name-taken create failure (inline UI handles it)', () => {
      const { harness, messageService, effects } = setup();
      effects.mutationFailureToast$.subscribe();
      harness.send(
        AdminCategoriesActions.createCategoryFailure({
          tempId: 't1',
          error: 'taken',
          errorCode: 'admin.category_name_taken',
        }),
      );
      expect(messageService.add).not.toHaveBeenCalled();
    });

    it('toasts other mutation failures', () => {
      const { harness, messageService, effects } = setup();
      effects.mutationFailureToast$.subscribe();
      harness.send(
        AdminCategoriesActions.updateVisibilityFailure({ id: 'c1', error: 'server error' }),
      );
      expect(messageService.add).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error', detail: 'server error' }),
      );
    });

    it('toasts a partial-failure delete-to-new-category', () => {
      const { harness, messageService, effects } = setup();
      effects.deletePartialFailureToast$.subscribe();
      harness.send(
        AdminCategoriesActions.deleteCategoryToNewCategoryPartialFailure({
          id: 'c1',
          createdCategoryId: 'c2',
          error: 'boom',
        }),
      );
      expect(messageService.add).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error' }),
      );
    });
  });
});
