import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';

import { actionsHarness, collect } from '../../../../testing/ngrx.helpers';
import { makeAdminReportQueue, makeAdminReportRow } from '../../../../testing/fixtures';
import { AdminReportsApiService } from '../services/admin-reports-api.service';
import { adminReportsFeatureKey } from './admin-reports.reducer';
import { initialAdminReportsState } from './admin-reports.state';
import * as AdminReportsActions from './admin-reports.actions';
import { AdminReportsEffects } from './admin-reports.effects';

function setup(api: Partial<AdminReportsApiService> = {}, initialState = initialAdminReportsState) {
  const harness = actionsHarness();
  const messageService = { add: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      AdminReportsEffects,
      harness.provider,
      provideMockStore({
        initialState: { [adminReportsFeatureKey]: initialState },
      }),
      { provide: AdminReportsApiService, useValue: api },
      { provide: MessageService, useValue: messageService },
      { provide: TranslateService, useValue: { instant: (k: string) => k } },
    ],
  });
  return { harness, messageService, effects: TestBed.inject(AdminReportsEffects) };
}

describe('AdminReportsEffects', () => {
  it('loads the queue using the current request params', async () => {
    const queue = makeAdminReportQueue({ items: [makeAdminReportRow()] });
    const getReportQueue = vi.fn().mockReturnValue(of(queue));
    const { harness, effects } = setup({ getReportQueue });
    const result = collect(effects.loadReportQueue$);
    harness.send(AdminReportsActions.loadReportQueue());
    harness.complete();
    expect(await result).toEqual([AdminReportsActions.loadReportQueueSuccess({ queue })]);
    expect(getReportQueue).toHaveBeenCalledWith({
      status: 'open',
      search: '',
      page: 1,
      pageSize: 20,
    });
  });

  it('includes targetType/targetId in the request params when a target filter is set', async () => {
    const queue = makeAdminReportQueue();
    const getReportQueue = vi.fn().mockReturnValue(of(queue));
    const { harness, effects } = setup(
      { getReportQueue },
      {
        ...initialAdminReportsState,
        statusFilter: 'all',
        targetFilter: { targetType: 'User', targetId: 'user-9' },
      },
    );
    const result = collect(effects.loadReportQueue$);
    harness.send(AdminReportsActions.loadReportQueue());
    harness.complete();
    await result;
    expect(getReportQueue).toHaveBeenCalledWith({
      status: 'all',
      search: '',
      targetType: 'User',
      targetId: 'user-9',
      page: 1,
      pageSize: 20,
    });
  });

  it('re-dispatches loadReportQueue on tab/search/target-filter/page changes', async () => {
    const { harness, effects } = setup();
    const result = collect(effects.reloadOnFilterChange$);
    harness.send(AdminReportsActions.setReportStatusFilter({ status: 'resolved' }));
    harness.send(AdminReportsActions.setReportSearch({ search: 'anahit' }));
    harness.send(
      AdminReportsActions.setReportTargetFilter({
        targetFilter: { targetType: 'User', targetId: 'u1' },
      }),
    );
    harness.send(AdminReportsActions.setReportPage({ page: 2 }));
    harness.complete();
    expect(await result).toEqual([
      AdminReportsActions.loadReportQueue(),
      AdminReportsActions.loadReportQueue(),
      AdminReportsActions.loadReportQueue(),
      AdminReportsActions.loadReportQueue(),
    ]);
  });

  it('re-dispatches loadReportQueue after a successful mutation (counts refetch)', async () => {
    const { harness, effects } = setup();
    const result = collect(effects.refetchAfterMutation$);
    const report = makeAdminReportRow();
    harness.send(AdminReportsActions.resolveReportSuccess({ reportId: 'r1', report }));
    harness.send(AdminReportsActions.dismissReportSuccess({ reportId: 'r1', report }));
    harness.send(AdminReportsActions.reopenReportSuccess({ reportId: 'r1', report }));
    harness.complete();
    expect(await result).toEqual([
      AdminReportsActions.loadReportQueue(),
      AdminReportsActions.loadReportQueue(),
      AdminReportsActions.loadReportQueue(),
    ]);
  });

  describe('resolve', () => {
    it('emits success with the returned report, passing the note through', async () => {
      const report = makeAdminReportRow({ id: 'r1', status: 'Resolved' });
      const resolveReport = vi.fn().mockReturnValue(of(report));
      const { harness, effects } = setup({ resolveReport });
      const result = collect(effects.resolveReport$);
      harness.send(AdminReportsActions.resolveReport({ reportId: 'r1', note: 'fixed' }));
      harness.complete();
      expect(await result).toEqual([
        AdminReportsActions.resolveReportSuccess({ reportId: 'r1', report }),
      ]);
      expect(resolveReport).toHaveBeenCalledWith('r1', 'fixed');
    });

    it('emits failure carrying the report id, message, and error code', async () => {
      const problem = new HttpErrorResponse({
        status: 404,
        error: { errorCode: 'admin.report_not_found', title: 'Not found' },
      });
      const { harness, effects } = setup({
        resolveReport: vi.fn().mockReturnValue(throwError(() => problem)),
      });
      const result = collect(effects.resolveReport$);
      harness.send(AdminReportsActions.resolveReport({ reportId: 'r1' }));
      harness.complete();
      expect(await result).toEqual([
        AdminReportsActions.resolveReportFailure({
          reportId: 'r1',
          error: 'Not found',
          errorCode: 'admin.report_not_found',
        }),
      ]);
    });
  });

  describe('dismiss', () => {
    it('emits success with the returned report', async () => {
      const report = makeAdminReportRow({ id: 'r1', status: 'Dismissed' });
      const { harness, effects } = setup({
        dismissReport: vi.fn().mockReturnValue(of(report)),
      });
      const result = collect(effects.dismissReport$);
      harness.send(AdminReportsActions.dismissReport({ reportId: 'r1' }));
      harness.complete();
      expect(await result).toEqual([
        AdminReportsActions.dismissReportSuccess({ reportId: 'r1', report }),
      ]);
    });

    it('emits failure on error', async () => {
      const { harness, effects } = setup({
        dismissReport: vi.fn().mockReturnValue(throwError(() => new Error('boom'))),
      });
      const result = collect(effects.dismissReport$);
      harness.send(AdminReportsActions.dismissReport({ reportId: 'r1' }));
      harness.complete();
      expect(await result).toEqual([
        AdminReportsActions.dismissReportFailure({
          reportId: 'r1',
          error: 'boom',
          errorCode: null,
        }),
      ]);
    });
  });

  describe('reopen', () => {
    it('emits success with the returned report', async () => {
      const report = makeAdminReportRow({ id: 'r1', status: 'Open' });
      const { harness, effects } = setup({
        reopenReport: vi.fn().mockReturnValue(of(report)),
      });
      const result = collect(effects.reopenReport$);
      harness.send(AdminReportsActions.reopenReport({ reportId: 'r1' }));
      harness.complete();
      expect(await result).toEqual([
        AdminReportsActions.reopenReportSuccess({ reportId: 'r1', report }),
      ]);
    });
  });

  describe('toasts', () => {
    it('shows a success toast on resolve', () => {
      const { harness, effects, messageService } = setup();
      TestBed.runInInjectionContext(() => effects.resolveSuccessToast$.subscribe());
      harness.send(
        AdminReportsActions.resolveReportSuccess({ reportId: 'r1', report: makeAdminReportRow() }),
      );
      expect(messageService.add).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'success' }),
      );
    });

    it('shows an error toast on failure, using the known-code translation when available', () => {
      const { harness, effects, messageService } = setup();
      TestBed.runInInjectionContext(() => effects.actionFailureToast$.subscribe());
      harness.send(
        AdminReportsActions.resolveReportFailure({
          reportId: 'r1',
          error: 'raw message',
          errorCode: 'admin.report_not_found',
        }),
      );
      expect(messageService.add).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'error',
          detail: 'admin.reports.errors.reportNotFound',
        }),
      );
    });
  });
});
