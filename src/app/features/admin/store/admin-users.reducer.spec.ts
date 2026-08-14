import { makeAdminUser, makeAdminUserQueue } from '../../../../testing/fixtures';
import * as AdminUsersActions from './admin-users.actions';
import { adminUsersReducer } from './admin-users.reducer';
import { initialAdminUsersState, type AdminUsersState } from './admin-users.state';

function stateWith(overrides: Partial<AdminUsersState>): AdminUsersState {
  return { ...initialAdminUsersState, ...overrides };
}

describe('adminUsersReducer', () => {
  describe('queue load', () => {
    it('replaces the queue and summary on success', () => {
      const items = [makeAdminUser({ id: 'u1' }), makeAdminUser({ id: 'u2' })];
      const next = adminUsersReducer(
        stateWith({ isLoading: true }),
        AdminUsersActions.loadUserQueueSuccess({
          queue: makeAdminUserQueue({
            items,
            totalCount: 2,
            totalPages: 1,
            summary: { totalUsers: 2, verifiedCount: 1, pendingCount: 1, suspendedCount: 0 },
          }),
        }),
      );
      expect(next.items).toEqual(items);
      expect(next.summary).toEqual({
        totalUsers: 2,
        verifiedCount: 1,
        pendingCount: 1,
        suspendedCount: 0,
      });
      expect(next.isLoading).toBe(false);
      expect(next.error).toBeNull();
    });

    it('records the error on failure', () => {
      const next = adminUsersReducer(
        stateWith({ isLoading: true }),
        AdminUsersActions.loadUserQueueFailure({ error: 'boom' }),
      );
      expect(next.isLoading).toBe(false);
      expect(next.error).toBe('boom');
    });

    it('resets to page 1 when the status filter changes', () => {
      const next = adminUsersReducer(
        stateWith({ page: 3, statusFilter: 'pending' }),
        AdminUsersActions.setUserStatusFilter({ status: 'suspended' }),
      );
      expect(next.statusFilter).toBe('suspended');
      expect(next.page).toBe(1);
    });

    it('resets to page 1 when the search term changes', () => {
      const next = adminUsersReducer(
        stateWith({ page: 3 }),
        AdminUsersActions.setUserSearch({ search: 'anahit' }),
      );
      expect(next.search).toBe('anahit');
      expect(next.page).toBe(1);
    });

    it('resets to page 1 when the sort changes', () => {
      const next = adminUsersReducer(
        stateWith({ page: 3 }),
        AdminUsersActions.setUserSort({ sort: 'flags' }),
      );
      expect(next.sort).toBe('flags');
      expect(next.page).toBe(1);
    });

    it('sets the page', () => {
      const next = adminUsersReducer(
        initialAdminUsersState,
        AdminUsersActions.setUserPage({ page: 2 }),
      );
      expect(next.page).toBe(2);
    });
  });

  describe('verify (optimistic)', () => {
    it('flips a Pending row to Active and confirms identity immediately', () => {
      const start = stateWith({
        items: [makeAdminUser({ id: 'u1', status: 'Pending', isIdConfirmed: false })],
      });
      const next = adminUsersReducer(start, AdminUsersActions.verifyUser({ userId: 'u1' }));
      expect(next.items[0].status).toBe('Active');
      expect(next.items[0].isIdConfirmed).toBe(true);
      expect(next.actionIds).toEqual(['u1']);
      expect(next.rollbacks['u1']).toBeDefined();
    });

    it('removes the row from the Pending ID tab once verified', () => {
      const start = stateWith({
        statusFilter: 'pending',
        items: [makeAdminUser({ id: 'u1', status: 'Pending' })],
      });
      const next = adminUsersReducer(start, AdminUsersActions.verifyUser({ userId: 'u1' }));
      expect(next.items).toEqual([]);
    });

    it('leaves a Suspended row Suspended (only confirms identity)', () => {
      const start = stateWith({
        items: [makeAdminUser({ id: 'u1', status: 'Suspended', isIdConfirmed: false })],
      });
      const next = adminUsersReducer(start, AdminUsersActions.verifyUser({ userId: 'u1' }));
      expect(next.items[0].status).toBe('Suspended');
      expect(next.items[0].isIdConfirmed).toBe(true);
    });

    it('applies the server response and clears the rollback on success', () => {
      const start = adminUsersReducer(
        stateWith({ items: [makeAdminUser({ id: 'u1', status: 'Pending', flagCount: 0 })] }),
        AdminUsersActions.verifyUser({ userId: 'u1' }),
      );
      const serverUser = makeAdminUser({ id: 'u1', status: 'Active', flagCount: 2 });
      const next = adminUsersReducer(
        start,
        AdminUsersActions.verifyUserSuccess({ userId: 'u1', user: serverUser }),
      );
      expect(next.items[0]).toEqual(serverUser);
      expect(next.actionIds).toEqual([]);
      expect(next.rollbacks['u1']).toBeUndefined();
    });

    it('restores the original row and records the error on failure', () => {
      const original = makeAdminUser({ id: 'u1', status: 'Pending', isIdConfirmed: false });
      const start = adminUsersReducer(
        stateWith({ items: [original, makeAdminUser({ id: 'u2' })] }),
        AdminUsersActions.verifyUser({ userId: 'u1' }),
      );
      const next = adminUsersReducer(
        start,
        AdminUsersActions.verifyUserFailure({ userId: 'u1', error: 'nope', errorCode: null }),
      );
      expect(next.items).toEqual([original, expect.objectContaining({ id: 'u2' })]);
      expect(next.actionIds).toEqual([]);
      expect(next.error).toBe('nope');
      expect(next.rollbacks['u1']).toBeUndefined();
    });

    it('re-inserts a row that left the current tab, at its original position, on failure', () => {
      const original = makeAdminUser({ id: 'u1', status: 'Pending' });
      const other = makeAdminUser({ id: 'u2', status: 'Pending' });
      const start = adminUsersReducer(
        stateWith({ statusFilter: 'pending', items: [original, other] }),
        AdminUsersActions.verifyUser({ userId: 'u1' }),
      );
      expect(start.items.map((i) => i.id)).toEqual(['u2']);

      const next = adminUsersReducer(
        start,
        AdminUsersActions.verifyUserFailure({ userId: 'u1', error: 'nope', errorCode: null }),
      );
      expect(next.items.map((i) => i.id)).toEqual(['u1', 'u2']);
      expect(next.items[0]).toEqual(original);
    });
  });

  describe('suspend (optimistic)', () => {
    it('patches status to Suspended immediately', () => {
      const start = stateWith({ items: [makeAdminUser({ id: 'u1', status: 'Active' })] });
      const next = adminUsersReducer(start, AdminUsersActions.suspendUser({ userId: 'u1' }));
      expect(next.items[0].status).toBe('Suspended');
      expect(next.actionIds).toEqual(['u1']);
    });

    it('removes the row from the All tab is unaffected (still matches "all")', () => {
      const start = stateWith({
        statusFilter: 'all',
        items: [makeAdminUser({ id: 'u1', status: 'Active' })],
      });
      const next = adminUsersReducer(start, AdminUsersActions.suspendUser({ userId: 'u1' }));
      expect(next.items.map((i) => i.id)).toEqual(['u1']);
    });

    it('restores the row on failure', () => {
      const original = makeAdminUser({ id: 'u1', status: 'Active' });
      const start = adminUsersReducer(
        stateWith({ items: [original] }),
        AdminUsersActions.suspendUser({ userId: 'u1' }),
      );
      const next = adminUsersReducer(
        start,
        AdminUsersActions.suspendUserFailure({
          userId: 'u1',
          error: 'admin.cannot_suspend_admin',
          errorCode: 'admin.cannot_suspend_admin',
        }),
      );
      expect(next.items[0]).toEqual(original);
      expect(next.error).toBe('admin.cannot_suspend_admin');
    });
  });

  describe('reactivate (optimistic)', () => {
    it('goes to Active when identity is already confirmed', () => {
      const start = stateWith({
        items: [makeAdminUser({ id: 'u1', status: 'Suspended', isIdConfirmed: true })],
      });
      const next = adminUsersReducer(start, AdminUsersActions.reactivateUser({ userId: 'u1' }));
      expect(next.items[0].status).toBe('Active');
    });

    it('goes back to Pending when identity was never confirmed', () => {
      const start = stateWith({
        items: [makeAdminUser({ id: 'u1', status: 'Suspended', isIdConfirmed: false })],
      });
      const next = adminUsersReducer(start, AdminUsersActions.reactivateUser({ userId: 'u1' }));
      expect(next.items[0].status).toBe('Pending');
    });

    it('removes the row from the Suspended tab once reactivated', () => {
      const start = stateWith({
        statusFilter: 'suspended',
        items: [makeAdminUser({ id: 'u1', status: 'Suspended', isIdConfirmed: true })],
      });
      const next = adminUsersReducer(start, AdminUsersActions.reactivateUser({ userId: 'u1' }));
      expect(next.items).toEqual([]);
    });

    it('applies the server response on success', () => {
      const start = adminUsersReducer(
        stateWith({ items: [makeAdminUser({ id: 'u1', status: 'Suspended' })] }),
        AdminUsersActions.reactivateUser({ userId: 'u1' }),
      );
      const serverUser = makeAdminUser({ id: 'u1', status: 'Active' });
      const next = adminUsersReducer(
        start,
        AdminUsersActions.reactivateUserSuccess({ userId: 'u1', user: serverUser }),
      );
      expect(next.items[0]).toEqual(serverUser);
      expect(next.rollbacks['u1']).toBeUndefined();
    });
  });

  describe('mutation dispatched for a row not currently loaded', () => {
    it('tracks the action id without touching items or throwing', () => {
      const start = stateWith({ items: [makeAdminUser({ id: 'u1' })] });
      const next = adminUsersReducer(start, AdminUsersActions.suspendUser({ userId: 'missing' }));
      expect(next.items).toEqual(start.items);
      expect(next.actionIds).toEqual(['missing']);
      expect(next.rollbacks['missing']).toBeUndefined();
    });
  });
});
