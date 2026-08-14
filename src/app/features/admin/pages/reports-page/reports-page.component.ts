import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Actions, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { debounceTime, distinctUntilChanged, filter, skip } from 'rxjs';

import { AvatarComponent } from '../../../../shared/ui/avatar/avatar.component';
import { EmptyStateComponent } from '../../../../shared/ui/empty-state/empty-state.component';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { AdminPageHeaderComponent } from '../../components/admin-page-header/admin-page-header.component';
import { AdminReportDetailDialogComponent } from '../../components/admin-report-detail-dialog/admin-report-detail-dialog.component';
import { AdminReportSeverityPillComponent } from '../../components/admin-report-severity-pill/admin-report-severity-pill.component';
import { AdminReportStatusPillComponent } from '../../components/admin-report-status-pill/admin-report-status-pill.component';
import { AdminStatCardComponent } from '../../components/admin-stat-card/admin-stat-card.component';
import {
  AdminTabsComponent,
  type AdminTabItem,
} from '../../components/admin-tabs/admin-tabs.component';
import { reportReasonLabelKey } from '../../../reports/models/report-reason.model';
import type { AdminReportRow } from '../../models/admin-report.model';
import * as AdminReportsActions from '../../store/admin-reports.actions';
import {
  selectReportActionIds,
  selectReportCounts,
  selectReportError,
  selectReportItems,
  selectReportLoading,
  selectReportPage,
  selectReportSearch,
  selectReportStatusFilter,
  selectReportTargetFilter,
  selectReportTotalPages,
} from '../../store/admin-reports.selectors';
import { AdminBreakpointService } from '../../utils/admin-breakpoint.service';
import { reportRelativeTime } from '../../utils/admin-report-time.util';

const TYPE_ICON: Record<AdminReportRow['targetType'], string> = {
  Listing: 'tag',
  User: 'user',
  Message: 'message',
};

/**
 * `/admin/reports` — the redesigned Reports & flags screen (`AdminReportsDesktop` /
 * `AdminReportsMobile`). Replaces `admin-placeholder-page` for this route only.
 *
 * The Users screen deep-links here as `/admin/reports?userId=<id>` (see
 * `users-page.component.html`'s `viewReports`) — read once at mount and translated into the
 * backend's `targetType=User&targetId=<id>` queue filter (`AdminReportQueueParams`). The
 * banner it produces is dismissible via "Show all reports", which clears both the store filter
 * and the URL query param so a refresh doesn't silently re-apply a filter the admin already
 * backed out of.
 *
 * Sort is fixed server-side (severity descending, then oldest first) — there is intentionally
 * no client sort control here, unlike the Users screen.
 */
@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [
    AdminPageHeaderComponent,
    AdminReportDetailDialogComponent,
    AdminReportSeverityPillComponent,
    AdminReportStatusPillComponent,
    AdminStatCardComponent,
    AdminTabsComponent,
    AvatarComponent,
    EmptyStateComponent,
    IconComponent,
    MessageModule,
    SkeletonModule,
    TranslatePipe,
  ],
  templateUrl: './reports-page.component.html',
  styleUrl: './reports-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPageComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly actions$ = inject(Actions);

  private readonly breakpoint = inject(AdminBreakpointService);
  protected readonly isDesktop = this.breakpoint.isDesktop;

  // ── Store state ──
  protected readonly items = this.store.selectSignal(selectReportItems);
  protected readonly statusFilter = this.store.selectSignal(selectReportStatusFilter);
  protected readonly counts = this.store.selectSignal(selectReportCounts);
  protected readonly isLoading = this.store.selectSignal(selectReportLoading);
  protected readonly error = this.store.selectSignal(selectReportError);
  protected readonly actionIds = this.store.selectSignal(selectReportActionIds);
  protected readonly page = this.store.selectSignal(selectReportPage);
  protected readonly totalPages = this.store.selectSignal(selectReportTotalPages);
  protected readonly targetFilter = this.store.selectSignal(selectReportTargetFilter);
  private readonly storeSearch = this.store.selectSignal(selectReportSearch);

  protected readonly typeIcon = TYPE_ICON;
  protected readonly reportReasonLabelKey = reportReasonLabelKey;

  protected readonly tabs = computed<AdminTabItem[]>(() => {
    const c = this.counts();
    return [
      { id: 'open', labelKey: 'admin.reports.tabs.open', count: c.open },
      { id: 'resolved', labelKey: 'admin.reports.tabs.resolved', count: c.resolved },
      { id: 'dismissed', labelKey: 'admin.reports.tabs.dismissed', count: c.dismissed },
      { id: 'all', labelKey: 'admin.reports.tabs.all', count: c.all },
    ];
  });

  protected readonly showInitialSkeleton = computed(
    () => this.isLoading() && this.items().length === 0,
  );
  protected readonly showEmpty = computed(
    () => !this.isLoading() && this.items().length === 0 && this.error() === null,
  );
  protected readonly statsReady = computed(() => !this.showInitialSkeleton());

  // ── Search (debounced 300ms, same delay as `users-page`) ──
  protected readonly searchInput = signal(this.storeSearch());

  // ── Detail dialog — keeps live data after a mutation, same idiom as `users-page`'s
  // profile dialog (see that component's constructor doc comment). Two complementary
  // mechanisms:
  //  1. The `effect()` below keeps the snapshot in sync with any reload of `items()` while
  //     the row still matches the current status tab (e.g. another admin's queue refresh, or
  //     this admin's own mutation when it doesn't change which tab the row belongs to).
  //  2. The `actions$` subscription applies a resolve/dismiss/reopen mutation's fresh server
  //     row directly to the snapshot the moment it succeeds — needed because `items()` is
  //     status-filtered, so a mutation that moves the row OFF the current tab (e.g. resolving
  //     while on "Open") makes it vanish from `items()` and the `effect()` alone would never
  //     see the update, leaving the dialog frozen on stale data. Reuses the mutation response
  //     already returned by `admin-reports-api.service.ts` — no extra network round-trip. Same
  //     `Actions`-in-a-page-component idiom as `inspect-page.component.ts`'s
  //     approve/reject-success listener. ──
  private readonly selectedReportId = signal<string | null>(null);
  private readonly selectedReportSnapshot = signal<AdminReportRow | null>(null);
  protected readonly selectedReport = computed(() => this.selectedReportSnapshot());

  constructor() {
    toObservable(this.searchInput)
      .pipe(skip(1), debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((search) => {
        this.store.dispatch(AdminReportsActions.setReportSearch({ search }));
      });

    effect(() => {
      const id = this.selectedReportId();
      if (id === null) return;
      const live = this.items().find((item) => item.id === id);
      if (live) this.selectedReportSnapshot.set(live);
    });

    // Rollback on failure doesn't need a matching subscription here: `rollbackMutation`
    // (`admin-reports.reducer.ts`) restores the row to its pre-mutation value at its
    // pre-mutation index, which — since that's exactly where it matched the tab before the
    // mutation started — reappears in `items()` and the `effect()` above picks it back up.
    this.actions$
      .pipe(
        ofType(
          AdminReportsActions.resolveReportSuccess,
          AdminReportsActions.dismissReportSuccess,
          AdminReportsActions.reopenReportSuccess,
        ),
        filter(({ reportId }) => reportId === this.selectedReportId()),
        takeUntilDestroyed(),
      )
      .subscribe(({ report }) => {
        this.selectedReportSnapshot.set(report);
      });
  }

  ngOnInit(): void {
    const userId = this.route.snapshot.queryParamMap.get('userId');
    if (userId) {
      this.store.dispatch(
        AdminReportsActions.setReportTargetFilter({
          targetFilter: { targetType: 'User', targetId: userId },
        }),
      );
      this.store.dispatch(AdminReportsActions.setReportStatusFilter({ status: 'all' }));
    } else {
      // No deep-link param on this mount — clear any target filter left in the store from a
      // previous visit (e.g. Users → "View reports" for user X → Overview → Reports nav link)
      // so the queue doesn't silently come back filtered while the URL claims otherwise.
      this.store.dispatch(AdminReportsActions.setReportTargetFilter({ targetFilter: null }));
      this.store.dispatch(AdminReportsActions.loadReportQueue());
    }
  }

  protected targetLabel(row: AdminReportRow): string {
    return row.targetLabel;
  }

  protected reporterName(row: AdminReportRow): string {
    return `${row.reporterFirstName} ${row.reporterLastName}`.trim() || row.reporterEmail;
  }

  /** Resolves the relative-time display (`admin-report-time.util.ts`) to plain text — a
   *  translated "2h ago" or the absolute-date fallback for anything older than a week. */
  protected relativeTimeText(row: AdminReportRow): string {
    const display = reportRelativeTime(row.createdAt);
    if (display.key === null) return display.absolute ?? '';
    return this.translate.instant(display.key, display.params);
  }

  protected cardMeta(row: AdminReportRow): string {
    return this.translate.instant('admin.reports.card.meta', {
      reporter: this.reporterName(row),
      time: this.relativeTimeText(row),
    });
  }

  protected onSearchInput(event: Event): void {
    this.searchInput.set((event.target as HTMLInputElement).value);
  }

  protected retry(): void {
    this.store.dispatch(AdminReportsActions.loadReportQueue());
  }

  protected selectTab(status: string): void {
    this.store.dispatch(
      AdminReportsActions.setReportStatusFilter({
        status: status as 'open' | 'resolved' | 'dismissed' | 'all',
      }),
    );
  }

  protected goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.store.dispatch(AdminReportsActions.setReportPage({ page }));
  }

  /** "Show all reports" — clears both the store filter and the URL query param so a refresh
   *  can't silently re-apply a filter the admin already backed out of. */
  protected clearTargetFilter(): void {
    this.store.dispatch(AdminReportsActions.setReportTargetFilter({ targetFilter: null }));
    void this.router.navigate(['/admin/reports'], { replaceUrl: true });
  }

  protected isBusy(reportId: string): boolean {
    return this.actionIds().includes(reportId);
  }

  protected quickResolve(reportId: string): void {
    this.store.dispatch(AdminReportsActions.resolveReport({ reportId }));
  }

  protected quickDismiss(reportId: string): void {
    this.store.dispatch(AdminReportsActions.dismissReport({ reportId }));
  }

  protected quickReopen(reportId: string): void {
    this.store.dispatch(AdminReportsActions.reopenReport({ reportId }));
  }

  // ── Detail dialog ──
  protected openDetail(row: AdminReportRow): void {
    this.selectedReportId.set(row.id);
    this.selectedReportSnapshot.set(row);
  }

  protected closeDetail(): void {
    this.selectedReportId.set(null);
    this.selectedReportSnapshot.set(null);
  }

  protected onDialogResolve(reportId: string, payload: { note?: string }): void {
    this.store.dispatch(AdminReportsActions.resolveReport({ reportId, note: payload.note }));
  }

  protected onDialogDismiss(reportId: string, payload: { note?: string }): void {
    this.store.dispatch(AdminReportsActions.dismissReport({ reportId, note: payload.note }));
  }

  protected onDialogReopen(reportId: string): void {
    this.store.dispatch(AdminReportsActions.reopenReport({ reportId }));
  }
}
