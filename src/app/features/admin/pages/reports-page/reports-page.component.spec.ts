import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';

import { makeAdminReportRow } from '../../../../../testing/fixtures';
import { actionsHarness, type ActionsHarness } from '../../../../../testing/ngrx.helpers';
import * as AdminReportsActions from '../../store/admin-reports.actions';
import { adminReportsFeatureKey } from '../../store/admin-reports.reducer';
import { initialAdminReportsState } from '../../store/admin-reports.state';
import { ReportsPageComponent } from './reports-page.component';

function mockMatchMedia(matchesDesktop: boolean): void {
  (window as unknown as { matchMedia: typeof matchMedia }).matchMedia = ((query: string) => ({
    matches: query === '(min-width: 961px)' ? matchesDesktop : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof matchMedia;
}

describe('ReportsPageComponent', () => {
  let fixture: ComponentFixture<ReportsPageComponent>;
  let store: MockStore;
  let router: { navigate: ReturnType<typeof vi.fn> };
  // ReportsPageComponent injects NgRx's `Actions` stream directly (to apply a resolve/dismiss/
  // reopen mutation's fresh server row to an open detail dialog even when the row leaves the
  // current status tab) — provideMockStore alone doesn't supply that, so every test needs the
  // same `provideMockActions` harness the effects specs use. Same idiom as
  // `inspect-page.component.spec.ts`.
  let harness: ActionsHarness;

  async function setup(
    overrides: Partial<typeof initialAdminReportsState> = {},
    queryParams: Record<string, string> = {},
    desktop = true,
  ): Promise<void> {
    mockMatchMedia(desktop);
    router = { navigate: vi.fn() };
    harness = actionsHarness();
    await TestBed.configureTestingModule({
      imports: [ReportsPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
        harness.provider,
        provideMockStore({
          initialState: { [adminReportsFeatureKey]: { ...initialAdminReportsState, ...overrides } },
        }),
      ],
    }).compileComponents();
    store = TestBed.inject(MockStore);
    fixture = TestBed.createComponent(ReportsPageComponent);
    fixture.detectChanges();
  }

  it('dispatches loadReportQueue on init when there is no userId query param', async () => {
    mockMatchMedia(true);
    router = { navigate: vi.fn() };
    harness = actionsHarness();
    await TestBed.configureTestingModule({
      imports: [ReportsPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
        harness.provider,
        provideMockStore({ initialState: { [adminReportsFeatureKey]: initialAdminReportsState } }),
      ],
    }).compileComponents();
    store = TestBed.inject(MockStore);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    fixture = TestBed.createComponent(ReportsPageComponent);
    fixture.detectChanges();

    expect(dispatchSpy).toHaveBeenCalledWith(AdminReportsActions.loadReportQueue());
  });

  it('clears a stale target filter on init when there is no userId query param', async () => {
    // Regression: Users -> "View reports" for user X sets a target filter, then navigating to
    // Overview and back to Reports via the nav (no userId param) must not silently keep
    // filtering to user X while the URL claims otherwise.
    mockMatchMedia(true);
    router = { navigate: vi.fn() };
    harness = actionsHarness();
    await TestBed.configureTestingModule({
      imports: [ReportsPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
        harness.provider,
        provideMockStore({
          initialState: {
            [adminReportsFeatureKey]: {
              ...initialAdminReportsState,
              targetFilter: { targetType: 'User', targetId: 'user-9' },
            },
          },
        }),
      ],
    }).compileComponents();
    store = TestBed.inject(MockStore);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    fixture = TestBed.createComponent(ReportsPageComponent);
    fixture.detectChanges();

    expect(dispatchSpy).toHaveBeenCalledWith(
      AdminReportsActions.setReportTargetFilter({ targetFilter: null }),
    );
    expect(dispatchSpy).toHaveBeenCalledWith(AdminReportsActions.loadReportQueue());
  });

  it('translates a userId query param into the User target filter and switches to the All tab', async () => {
    mockMatchMedia(true);
    router = { navigate: vi.fn() };
    harness = actionsHarness();
    await TestBed.configureTestingModule({
      imports: [ReportsPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ userId: 'user-9' }) } },
        },
        harness.provider,
        provideMockStore({ initialState: { [adminReportsFeatureKey]: initialAdminReportsState } }),
      ],
    }).compileComponents();
    store = TestBed.inject(MockStore);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    fixture = TestBed.createComponent(ReportsPageComponent);
    fixture.detectChanges();

    expect(dispatchSpy).toHaveBeenCalledWith(
      AdminReportsActions.setReportTargetFilter({
        targetFilter: { targetType: 'User', targetId: 'user-9' },
      }),
    );
    expect(dispatchSpy).toHaveBeenCalledWith(
      AdminReportsActions.setReportStatusFilter({ status: 'all' }),
    );
  });

  it('shows the skeleton while loading with no items yet', async () => {
    await setup({ isLoading: true, items: [] });
    expect(
      fixture.nativeElement.querySelectorAll('.reports-page__skeleton-card').length,
    ).toBeGreaterThan(0);
  });

  it('shows the empty state once loaded with no reports', async () => {
    await setup({ isLoading: false, items: [] });
    expect(fixture.nativeElement.querySelector('app-ui-empty-state')).not.toBeNull();
  });

  it('renders one card per report', async () => {
    await setup({
      isLoading: false,
      items: [makeAdminReportRow({ id: 'r1' }), makeAdminReportRow({ id: 'r2' })],
    });
    expect(fixture.nativeElement.querySelectorAll('.reports-page__card').length).toBe(2);
  });

  it('shows the filtered-to-user banner with a "Show all reports" control when a target filter is set', async () => {
    await setup({ targetFilter: { targetType: 'User', targetId: 'user-9' } });
    const banner = fixture.nativeElement.querySelector('.reports-page__filter-banner');
    expect(banner).not.toBeNull();
    const clearBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.reports-page__filter-banner-clear',
    );
    expect(clearBtn).not.toBeNull();

    const dispatchSpy = vi.spyOn(store, 'dispatch');
    clearBtn.click();
    expect(dispatchSpy).toHaveBeenCalledWith(
      AdminReportsActions.setReportTargetFilter({ targetFilter: null }),
    );
    expect(router.navigate).toHaveBeenCalledWith(['/admin/reports'], { replaceUrl: true });
  });

  it('does not show the filter banner when there is no target filter', async () => {
    await setup({ targetFilter: null });
    expect(fixture.nativeElement.querySelector('.reports-page__filter-banner')).toBeNull();
  });

  it('dispatches resolveReport (no note) from the row quick action', async () => {
    await setup({ items: [makeAdminReportRow({ id: 'r1', status: 'Open' })] });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const resolveBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.reports-page__action-btn--resolve',
    );
    resolveBtn.click();
    expect(dispatchSpy).toHaveBeenCalledWith(AdminReportsActions.resolveReport({ reportId: 'r1' }));
  });

  it('dispatches dismissReport (no note) from the row quick action', async () => {
    await setup({ items: [makeAdminReportRow({ id: 'r1', status: 'Open' })] });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const dismissBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.reports-page__action-btn--dismiss',
    );
    dismissBtn.click();
    expect(dispatchSpy).toHaveBeenCalledWith(AdminReportsActions.dismissReport({ reportId: 'r1' }));
  });

  it('shows a reopen action for a non-open row', async () => {
    await setup({ items: [makeAdminReportRow({ id: 'r1', status: 'Dismissed' })] });
    const reopenBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.reports-page__action-btn--reopen',
    );
    expect(reopenBtn).not.toBeNull();

    const dispatchSpy = vi.spyOn(store, 'dispatch');
    reopenBtn.click();
    expect(dispatchSpy).toHaveBeenCalledWith(AdminReportsActions.reopenReport({ reportId: 'r1' }));
  });

  it('opens the detail dialog when "Open report" is clicked', async () => {
    await setup({ items: [makeAdminReportRow({ id: 'r1' })] });
    expect(fixture.nativeElement.querySelector('app-admin-report-detail-dialog')).toBeNull();

    const openBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.reports-page__action-btn--open',
    );
    openBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-admin-report-detail-dialog')).not.toBeNull();
  });

  it('dispatches setReportStatusFilter when a tab is selected', async () => {
    await setup({ counts: { open: 1, resolved: 2, dismissed: 0, all: 3 } });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    // No translation loader in this spec (`TranslateModule.forRoot()` with no loader renders
    // the raw key), so match on the tab's i18n key rather than its rendered English label.
    const resolvedTab: HTMLButtonElement | null = Array.from(
      fixture.nativeElement.querySelectorAll('.admin-tabs__tab'),
    ).find((el) =>
      (el as HTMLElement).textContent?.includes('admin.reports.tabs.resolved'),
    ) as HTMLButtonElement | null;
    expect(resolvedTab).not.toBeNull();
    resolvedTab?.click();
    expect(dispatchSpy).toHaveBeenCalledWith(
      AdminReportsActions.setReportStatusFilter({ status: 'resolved' }),
    );
  });

  describe('detail dialog stays in sync with a mutation made from inside it', () => {
    it('shows the resolved state and Reopen action once resolveReportSuccess fires, even though the row has left the Open tab', async () => {
      const openRow = makeAdminReportRow({ id: 'r1', status: 'Open' });
      // `statusFilter: 'open'` + `items` containing only the still-Open row simulates the bug
      // scenario: the row has already been dropped from the filtered list the mutation's own
      // optimistic patch would produce, so the fix must not depend on `items()` picking the row
      // back up.
      await setup({ statusFilter: 'open', items: [openRow] });

      const openBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
        '.reports-page__action-btn--open',
      );
      openBtn.click();
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('.admin-report-detail-dialog__btn--resolve'),
      ).not.toBeNull();
      expect(
        fixture.nativeElement.querySelector('.admin-report-detail-dialog__btn--reopen'),
      ).toBeNull();

      const resolvedRow = makeAdminReportRow({
        id: 'r1',
        status: 'Resolved',
        resolvedAt: '2026-08-13T00:00:00Z',
        resolutionNote: 'Listing fixed by owner.',
      });
      harness.send(
        AdminReportsActions.resolveReportSuccess({ reportId: 'r1', report: resolvedRow }),
      );
      fixture.detectChanges();

      // Resolve/Dismiss are gone, Reopen is now the only available action — the dialog reflects
      // the report's new true state instead of freezing on "Open".
      expect(
        fixture.nativeElement.querySelector('.admin-report-detail-dialog__btn--resolve'),
      ).toBeNull();
      expect(
        fixture.nativeElement.querySelector('.admin-report-detail-dialog__btn--dismiss'),
      ).toBeNull();
      const reopenBtn = fixture.nativeElement.querySelector(
        '.admin-report-detail-dialog__btn--reopen',
      );
      expect(reopenBtn).not.toBeNull();
      expect(fixture.nativeElement.textContent).toContain('Listing fixed by owner.');
    });

    it('ignores a success for a different report id', async () => {
      const openRow = makeAdminReportRow({ id: 'r1', status: 'Open' });
      await setup({ statusFilter: 'open', items: [openRow] });

      const openBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
        '.reports-page__action-btn--open',
      );
      openBtn.click();
      fixture.detectChanges();

      harness.send(
        AdminReportsActions.resolveReportSuccess({
          reportId: 'someone-else',
          report: makeAdminReportRow({ id: 'someone-else', status: 'Resolved' }),
        }),
      );
      fixture.detectChanges();

      // Still showing r1's Open state — the dialog only reacts to a success matching the
      // currently open report.
      expect(
        fixture.nativeElement.querySelector('.admin-report-detail-dialog__btn--resolve'),
      ).not.toBeNull();
    });

    it('on failure, keeps the dialog on the true prior (Open) state and surfaces the error instead of an optimistic value', async () => {
      const openRow = makeAdminReportRow({ id: 'r1', status: 'Open' });
      // The row is absent from `items()` the same way `beginMutation`'s optimistic patch would
      // leave it (removed from the Open tab as soon as the resolve request is in flight) — the
      // dialog's snapshot must NOT follow it there; it should stay showing the pre-mutation data
      // it was opened with.
      await setup({
        statusFilter: 'open',
        items: [],
        error: 'admin.reports.errors.reportNotFound',
      });

      // Opened directly (bypassing the row button, since the row isn't in `items()` any more)
      // the same way `openDetail` is invoked from a card click.
      fixture.componentInstance['openDetail'](openRow);
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('.admin-report-detail-dialog__btn--resolve'),
      ).not.toBeNull();

      harness.send(
        AdminReportsActions.resolveReportFailure({
          reportId: 'r1',
          error: 'admin.reports.errors.reportNotFound',
          errorCode: 'admin.report_not_found',
        }),
      );
      fixture.detectChanges();

      // No stale/optimistic "Resolved" state leaked into the dialog on failure.
      expect(
        fixture.nativeElement.querySelector('.admin-report-detail-dialog__btn--resolve'),
      ).not.toBeNull();
      expect(
        fixture.nativeElement.querySelector('.admin-report-detail-dialog__btn--reopen'),
      ).toBeNull();
      // The page-level error banner surfaces the failure.
      const errorBanner = fixture.nativeElement.querySelector('.reports-page__error');
      expect(errorBanner).not.toBeNull();
      expect(errorBanner.textContent).toContain('admin.reports.errors.reportNotFound');
    });
  });
});
