import { makeAdminReportQueue, makeAdminReportRow } from '../../../../testing/fixtures';
import * as AdminReportsActions from './admin-reports.actions';
import { adminReportsReducer } from './admin-reports.reducer';
import { initialAdminReportsState, type AdminReportsState } from './admin-reports.state';

function stateWith(overrides: Partial<AdminReportsState>): AdminReportsState {
  return { ...initialAdminReportsState, ...overrides };
}

describe('adminReportsReducer', () => {
  describe('queue load', () => {
    it('replaces the queue and counts on success', () => {
      const items = [makeAdminReportRow({ id: 'r1' }), makeAdminReportRow({ id: 'r2' })];
      const next = adminReportsReducer(
        stateWith({ isLoading: true }),
        AdminReportsActions.loadReportQueueSuccess({
          queue: makeAdminReportQueue({
            items,
            totalCount: 2,
            totalPages: 1,
            counts: { open: 2, resolved: 0, dismissed: 0, all: 2 },
          }),
        }),
      );
      expect(next.items).toEqual(items);
      expect(next.counts).toEqual({ open: 2, resolved: 0, dismissed: 0, all: 2 });
      expect(next.isLoading).toBe(false);
      expect(next.error).toBeNull();
    });

    it('records the error on failure', () => {
      const next = adminReportsReducer(
        stateWith({ isLoading: true }),
        AdminReportsActions.loadReportQueueFailure({ error: 'boom' }),
      );
      expect(next.isLoading).toBe(false);
      expect(next.error).toBe('boom');
    });

    it('resets to page 1 when the status filter changes', () => {
      const next = adminReportsReducer(
        stateWith({ page: 3, statusFilter: 'open' }),
        AdminReportsActions.setReportStatusFilter({ status: 'resolved' }),
      );
      expect(next.statusFilter).toBe('resolved');
      expect(next.page).toBe(1);
    });

    it('resets to page 1 when the search term changes', () => {
      const next = adminReportsReducer(
        stateWith({ page: 3 }),
        AdminReportsActions.setReportSearch({ search: 'anahit' }),
      );
      expect(next.search).toBe('anahit');
      expect(next.page).toBe(1);
    });

    it('resets to page 1 when the target filter is set (userId deep link)', () => {
      const next = adminReportsReducer(
        stateWith({ page: 3 }),
        AdminReportsActions.setReportTargetFilter({
          targetFilter: { targetType: 'User', targetId: 'user-9' },
        }),
      );
      expect(next.targetFilter).toEqual({ targetType: 'User', targetId: 'user-9' });
      expect(next.page).toBe(1);
    });

    it('clears the target filter when set to null (Show all reports)', () => {
      const start = stateWith({
        targetFilter: { targetType: 'User', targetId: 'user-9' },
        page: 2,
      });
      const next = adminReportsReducer(
        start,
        AdminReportsActions.setReportTargetFilter({ targetFilter: null }),
      );
      expect(next.targetFilter).toBeNull();
      expect(next.page).toBe(1);
    });

    it('sets the page', () => {
      const next = adminReportsReducer(
        initialAdminReportsState,
        AdminReportsActions.setReportPage({ page: 2 }),
      );
      expect(next.page).toBe(2);
    });
  });

  describe('resolve (optimistic)', () => {
    it('patches status to Resolved immediately and tracks the action id', () => {
      const start = stateWith({
        statusFilter: 'all',
        items: [makeAdminReportRow({ id: 'r1', status: 'Open' })],
      });
      const next = adminReportsReducer(
        start,
        AdminReportsActions.resolveReport({ reportId: 'r1' }),
      );
      expect(next.items[0].status).toBe('Resolved');
      expect(next.actionIds).toEqual(['r1']);
      expect(next.rollbacks['r1']).toBeDefined();
    });

    it('removes the row from the Open tab once resolved', () => {
      const start = stateWith({
        statusFilter: 'open',
        items: [makeAdminReportRow({ id: 'r1', status: 'Open' })],
      });
      const next = adminReportsReducer(
        start,
        AdminReportsActions.resolveReport({ reportId: 'r1' }),
      );
      expect(next.items).toEqual([]);
    });

    it('applies the server response and clears the rollback on success', () => {
      const start = adminReportsReducer(
        stateWith({
          statusFilter: 'all',
          items: [makeAdminReportRow({ id: 'r1', status: 'Open' })],
        }),
        AdminReportsActions.resolveReport({ reportId: 'r1', note: 'looks fine' }),
      );
      const serverReport = makeAdminReportRow({
        id: 'r1',
        status: 'Resolved',
        resolvedAt: '2026-08-13T00:00:00Z',
        resolutionNote: 'looks fine',
      });
      const next = adminReportsReducer(
        start,
        AdminReportsActions.resolveReportSuccess({ reportId: 'r1', report: serverReport }),
      );
      expect(next.items[0]).toEqual(serverReport);
      expect(next.actionIds).toEqual([]);
      expect(next.rollbacks['r1']).toBeUndefined();
    });

    it('restores the original row and records the error on failure', () => {
      const original = makeAdminReportRow({ id: 'r1', status: 'Open' });
      const other = makeAdminReportRow({ id: 'r2', status: 'Open' });
      const start = adminReportsReducer(
        stateWith({ statusFilter: 'all', items: [original, other] }),
        AdminReportsActions.resolveReport({ reportId: 'r1' }),
      );
      const next = adminReportsReducer(
        start,
        AdminReportsActions.resolveReportFailure({
          reportId: 'r1',
          error: 'nope',
          errorCode: 'admin.report_not_found',
        }),
      );
      expect(next.items).toEqual([original, other]);
      expect(next.actionIds).toEqual([]);
      expect(next.error).toBe('nope');
      expect(next.rollbacks['r1']).toBeUndefined();
    });

    it('re-inserts a row that left the current tab, at its original position, on failure', () => {
      const original = makeAdminReportRow({ id: 'r1', status: 'Open' });
      const other = makeAdminReportRow({ id: 'r2', status: 'Open' });
      const start = adminReportsReducer(
        stateWith({ statusFilter: 'open', items: [original, other] }),
        AdminReportsActions.resolveReport({ reportId: 'r1' }),
      );
      expect(start.items.map((i) => i.id)).toEqual(['r2']);

      const next = adminReportsReducer(
        start,
        AdminReportsActions.resolveReportFailure({
          reportId: 'r1',
          error: 'nope',
          errorCode: null,
        }),
      );
      expect(next.items.map((i) => i.id)).toEqual(['r1', 'r2']);
      expect(next.items[0]).toEqual(original);
    });
  });

  describe('dismiss (optimistic)', () => {
    it('patches status to Dismissed immediately', () => {
      const start = stateWith({
        statusFilter: 'all',
        items: [makeAdminReportRow({ id: 'r1', status: 'Open' })],
      });
      const next = adminReportsReducer(
        start,
        AdminReportsActions.dismissReport({ reportId: 'r1' }),
      );
      expect(next.items[0].status).toBe('Dismissed');
    });

    it('restores the row on failure', () => {
      const original = makeAdminReportRow({ id: 'r1', status: 'Open' });
      const start = adminReportsReducer(
        stateWith({ items: [original] }),
        AdminReportsActions.dismissReport({ reportId: 'r1' }),
      );
      const next = adminReportsReducer(
        start,
        AdminReportsActions.dismissReportFailure({
          reportId: 'r1',
          error: 'admin.report_not_found',
          errorCode: 'admin.report_not_found',
        }),
      );
      expect(next.items[0]).toEqual(original);
      expect(next.error).toBe('admin.report_not_found');
    });
  });

  describe('reopen (optimistic)', () => {
    it('patches status to Open immediately', () => {
      const start = stateWith({
        statusFilter: 'all',
        items: [makeAdminReportRow({ id: 'r1', status: 'Dismissed' })],
      });
      const next = adminReportsReducer(start, AdminReportsActions.reopenReport({ reportId: 'r1' }));
      expect(next.items[0].status).toBe('Open');
    });

    it('removes the row from the Dismissed tab once reopened', () => {
      const start = stateWith({
        statusFilter: 'dismissed',
        items: [makeAdminReportRow({ id: 'r1', status: 'Dismissed' })],
      });
      const next = adminReportsReducer(start, AdminReportsActions.reopenReport({ reportId: 'r1' }));
      expect(next.items).toEqual([]);
    });

    it('applies the server response on success', () => {
      const start = adminReportsReducer(
        stateWith({ items: [makeAdminReportRow({ id: 'r1', status: 'Dismissed' })] }),
        AdminReportsActions.reopenReport({ reportId: 'r1' }),
      );
      const serverReport = makeAdminReportRow({ id: 'r1', status: 'Open' });
      const next = adminReportsReducer(
        start,
        AdminReportsActions.reopenReportSuccess({ reportId: 'r1', report: serverReport }),
      );
      expect(next.items[0]).toEqual(serverReport);
      expect(next.rollbacks['r1']).toBeUndefined();
    });
  });

  describe('mutation dispatched for a row not currently loaded', () => {
    it('tracks the action id without touching items or throwing', () => {
      const start = stateWith({ items: [makeAdminReportRow({ id: 'r1' })] });
      const next = adminReportsReducer(
        start,
        AdminReportsActions.dismissReport({ reportId: 'missing' }),
      );
      expect(next.items).toEqual(start.items);
      expect(next.actionIds).toEqual(['missing']);
      expect(next.rollbacks['missing']).toBeUndefined();
    });
  });
});
