import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';

import { actionsHarness, collect } from '../../../../testing/ngrx.helpers';
import { makeAdminUser, makeAdminUserQueue } from '../../../../testing/fixtures';
import { AdminUsersApiService } from '../services/admin-users-api.service';
import { adminUsersFeatureKey } from './admin-users.reducer';
import { initialAdminUsersState } from './admin-users.state';
import * as AdminUsersActions from './admin-users.actions';
import { AdminUsersEffects } from './admin-users.effects';

function setup(api: Partial<AdminUsersApiService> = {}) {
  const harness = actionsHarness();
  const messageService = { add: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      AdminUsersEffects,
      harness.provider,
      provideMockStore({
        initialState: { [adminUsersFeatureKey]: initialAdminUsersState },
      }),
      { provide: AdminUsersApiService, useValue: api },
      { provide: MessageService, useValue: messageService },
      { provide: TranslateService, useValue: { instant: (k: string) => k } },
    ],
  });
  return { harness, messageService, effects: TestBed.inject(AdminUsersEffects) };
}

describe('AdminUsersEffects', () => {
  it('loads the queue using the current request params', async () => {
    const queue = makeAdminUserQueue({ items: [makeAdminUser()] });
    const getUserQueue = vi.fn().mockReturnValue(of(queue));
    const { harness, effects } = setup({ getUserQueue });
    const result = collect(effects.loadUserQueue$);
    harness.send(AdminUsersActions.loadUserQueue());
    harness.complete();
    expect(await result).toEqual([AdminUsersActions.loadUserQueueSuccess({ queue })]);
    expect(getUserQueue).toHaveBeenCalledWith({
      status: 'all',
      search: '',
      sort: 'name',
      page: 1,
      pageSize: 20,
    });
  });

  it('re-dispatches loadUserQueue on tab/search/sort/page changes', async () => {
    const { harness, effects } = setup();
    const result = collect(effects.reloadOnFilterChange$);
    harness.send(AdminUsersActions.setUserStatusFilter({ status: 'pending' }));
    harness.send(AdminUsersActions.setUserSearch({ search: 'anahit' }));
    harness.send(AdminUsersActions.setUserSort({ sort: 'flags' }));
    harness.send(AdminUsersActions.setUserPage({ page: 2 }));
    harness.complete();
    expect(await result).toEqual([
      AdminUsersActions.loadUserQueue(),
      AdminUsersActions.loadUserQueue(),
      AdminUsersActions.loadUserQueue(),
      AdminUsersActions.loadUserQueue(),
    ]);
  });

  it('re-dispatches loadUserQueue after a successful mutation (summary refetch)', async () => {
    const { harness, effects } = setup();
    const result = collect(effects.refetchAfterMutation$);
    const user = makeAdminUser();
    harness.send(AdminUsersActions.verifyUserSuccess({ userId: 'u1', user }));
    harness.send(AdminUsersActions.suspendUserSuccess({ userId: 'u1', user }));
    harness.send(AdminUsersActions.reactivateUserSuccess({ userId: 'u1', user }));
    harness.complete();
    expect(await result).toEqual([
      AdminUsersActions.loadUserQueue(),
      AdminUsersActions.loadUserQueue(),
      AdminUsersActions.loadUserQueue(),
    ]);
  });

  describe('verify', () => {
    it('emits success with the returned user', async () => {
      const user = makeAdminUser({ id: 'u1', status: 'Active' });
      const { harness, effects } = setup({ verifyUser: vi.fn().mockReturnValue(of(user)) });
      const result = collect(effects.verifyUser$);
      harness.send(AdminUsersActions.verifyUser({ userId: 'u1' }));
      harness.complete();
      expect(await result).toEqual([AdminUsersActions.verifyUserSuccess({ userId: 'u1', user })]);
    });

    it('emits failure carrying the user id, message, and error code', async () => {
      const problem = new HttpErrorResponse({
        status: 404,
        error: { errorCode: 'admin.user_not_found', title: 'Not found' },
      });
      const { harness, effects } = setup({
        verifyUser: vi.fn().mockReturnValue(throwError(() => problem)),
      });
      const result = collect(effects.verifyUser$);
      harness.send(AdminUsersActions.verifyUser({ userId: 'u1' }));
      harness.complete();
      expect(await result).toEqual([
        AdminUsersActions.verifyUserFailure({
          userId: 'u1',
          error: 'Not found',
          errorCode: 'admin.user_not_found',
        }),
      ]);
    });
  });

  describe('suspend', () => {
    it('emits success with the returned user', async () => {
      const user = makeAdminUser({ id: 'u1', status: 'Suspended' });
      const { harness, effects } = setup({ suspendUser: vi.fn().mockReturnValue(of(user)) });
      const result = collect(effects.suspendUser$);
      harness.send(AdminUsersActions.suspendUser({ userId: 'u1' }));
      harness.complete();
      expect(await result).toEqual([AdminUsersActions.suspendUserSuccess({ userId: 'u1', user })]);
    });

    it('emits failure with the cannot_suspend_admin error code', async () => {
      const problem = new HttpErrorResponse({
        status: 400,
        error: { errorCode: 'admin.cannot_suspend_admin', title: 'Cannot suspend an admin' },
      });
      const { harness, effects } = setup({
        suspendUser: vi.fn().mockReturnValue(throwError(() => problem)),
      });
      const result = collect(effects.suspendUser$);
      harness.send(AdminUsersActions.suspendUser({ userId: 'u1' }));
      harness.complete();
      expect(await result).toEqual([
        AdminUsersActions.suspendUserFailure({
          userId: 'u1',
          error: 'Cannot suspend an admin',
          errorCode: 'admin.cannot_suspend_admin',
        }),
      ]);
    });
  });

  describe('reactivate', () => {
    it('emits success with the returned user', async () => {
      const user = makeAdminUser({ id: 'u1', status: 'Active' });
      const { harness, effects } = setup({
        reactivateUser: vi.fn().mockReturnValue(of(user)),
      });
      const result = collect(effects.reactivateUser$);
      harness.send(AdminUsersActions.reactivateUser({ userId: 'u1' }));
      harness.complete();
      expect(await result).toEqual([
        AdminUsersActions.reactivateUserSuccess({ userId: 'u1', user }),
      ]);
    });
  });

  describe('toasts', () => {
    it('shows a success toast after a verify', () => {
      const { harness, messageService, effects } = setup();
      effects.verifySuccessToast$.subscribe();
      harness.send(AdminUsersActions.verifyUserSuccess({ userId: 'u1', user: makeAdminUser() }));
      expect(messageService.add).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'success' }),
      );
    });

    it('shows the dedicated cannot_suspend_self message instead of the raw error', () => {
      const { harness, messageService, effects } = setup();
      effects.actionFailureToast$.subscribe();
      harness.send(
        AdminUsersActions.suspendUserFailure({
          userId: 'u1',
          error: 'You cannot suspend your own account.',
          errorCode: 'admin.cannot_suspend_self',
        }),
      );
      expect(messageService.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: 'admin.users.errors.cannotSuspendSelf',
        }),
      );
    });

    it('falls back to the raw error message for an unknown error code', () => {
      const { harness, messageService, effects } = setup();
      effects.actionFailureToast$.subscribe();
      harness.send(
        AdminUsersActions.verifyUserFailure({
          userId: 'u1',
          error: 'boom',
          errorCode: null,
        }),
      );
      expect(messageService.add).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'error', detail: 'boom' }),
      );
    });
  });
});
