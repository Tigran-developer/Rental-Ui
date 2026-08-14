import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';

import { EmptyStateComponent } from '../../../../shared/ui/empty-state/empty-state.component';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { AdminPageHeaderComponent } from '../../components/admin-page-header/admin-page-header.component';
import { AdminStatCardComponent } from '../../components/admin-stat-card/admin-stat-card.component';
import type { AdminActivityItem } from '../../models/admin-overview.model';
import * as AdminOverviewActions from '../../store/admin-overview.actions';
import {
  selectActivityError,
  selectActivityItems,
  selectActivityLoading,
  selectOverview,
  selectOverviewError,
  selectOverviewLoading,
} from '../../store/admin-overview.selectors';
import {
  activityActorDisplay,
  activityLineKey,
  activityTone,
  parseRecategoriseDetail,
  parseRejectDetail,
  type ActivityTone,
} from '../../utils/admin-activity-line.util';
import { overviewRelativeTime } from '../../utils/admin-overview-time.util';

/** How many rows the "Recent moderation" panel asks for — a compact preview, not a full log
 *  (there is no dedicated activity-log page in this phase). */
const ACTIVITY_FEED_TAKE = 8;

/**
 * `/admin/overview` — the console landing screen (`AdminOverviewDesktop` /
 * `AdminOverviewMobileBody`): four stat tiles, the "Priority" review CTA, and the recent
 * moderation feed. The rail's own "Queue health" panel (average review time / target) lives in
 * `AdminShellComponent` — it renders on every `/admin/*` page, not just this one, so it is wired
 * there rather than duplicated here (see that component's `queueHealth` doc comment).
 *
 * Fetches `adminOverview` state once per admin session and shares it with the shell: both this
 * page and `AdminShellComponent` dispatch `loadOverview()`, but this page only does so when the
 * store doesn't already have (or isn't already fetching) the data — see `ngOnInit` — so
 * navigating straight to `/admin/overview` doesn't fire two near-simultaneous requests for the
 * same resource.
 */
@Component({
  selector: 'app-overview-page',
  standalone: true,
  imports: [
    AdminPageHeaderComponent,
    AdminStatCardComponent,
    EmptyStateComponent,
    IconComponent,
    MessageModule,
    RouterLink,
    SkeletonModule,
    TranslatePipe,
  ],
  templateUrl: './overview-page.component.html',
  styleUrl: './overview-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewPageComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly translate = inject(TranslateService);

  protected readonly overview = this.store.selectSignal(selectOverview);
  protected readonly isLoadingOverview = this.store.selectSignal(selectOverviewLoading);
  protected readonly overviewError = this.store.selectSignal(selectOverviewError);

  protected readonly activity = this.store.selectSignal(selectActivityItems);
  protected readonly isLoadingActivity = this.store.selectSignal(selectActivityLoading);
  protected readonly activityError = this.store.selectSignal(selectActivityError);

  protected readonly showActivitySkeleton = computed(
    () => this.activity().length === 0 && this.isLoadingActivity(),
  );
  protected readonly showActivityEmpty = computed(
    () =>
      !this.isLoadingActivity() && this.activity().length === 0 && this.activityError() === null,
  );

  /** `awaitingReviewCount === 0` swaps the CTA into a positive "caught up" variant instead of
   *  the literal-but-odd "0 toys are waiting for your review" — same judgment call as the
   *  design's own "All caught up" empty state for the review queue itself. */
  protected readonly ctaCaughtUp = computed(
    () => (this.overview()?.awaitingReviewCount ?? 1) === 0,
  );

  constructor() {
    if (this.overview() === null && !this.isLoadingOverview()) {
      this.store.dispatch(AdminOverviewActions.loadOverview());
    }
  }

  ngOnInit(): void {
    this.store.dispatch(
      AdminOverviewActions.loadActivityFeed({ params: { take: ACTIVITY_FEED_TAKE } }),
    );
  }

  protected retryOverview(): void {
    this.store.dispatch(AdminOverviewActions.loadOverview());
  }

  protected retryActivity(): void {
    this.store.dispatch(
      AdminOverviewActions.loadActivityFeed({ params: { take: ACTIVITY_FEED_TAKE } }),
    );
  }

  // ── Stat sub-lines — every value is server data; null is a distinct state from 0 (see
  // `AdminOverview`'s doc comments), never collapsed into a hardcoded number or "0". ──

  protected awaitingReviewSubLabel(): string | null {
    const overview = this.overview();
    if (overview === null) return null;
    if (overview.oldestAwaitingCreatedAt === null) {
      return this.translate.instant('admin.overview.stats.awaitingReview.caughtUp');
    }
    const rel = overviewRelativeTime(overview.oldestAwaitingCreatedAt);
    const time = this.translate.instant(rel.key, rel.params);
    return this.translate.instant('admin.overview.stats.awaitingReview.oldest', { time });
  }

  protected liveListingsSubLabel(): string | null {
    const overview = this.overview();
    if (overview === null) return null;
    return this.translate.instant('admin.overview.stats.liveListings.addedThisWeek', {
      count: overview.liveListingsAddedThisWeek,
    });
  }

  protected categoriesSubLabel(): string | null {
    const overview = this.overview();
    if (overview === null) return null;
    return this.translate.instant('admin.overview.stats.categories.visible', {
      count: overview.visibleCategoryCount,
    });
  }

  protected reportsSubLabel(): string | null {
    const overview = this.overview();
    if (overview === null) return null;
    return this.translate.instant(
      overview.openReportCount > 0
        ? 'admin.overview.stats.reports.needsAction'
        : 'admin.overview.stats.reports.allClear',
    );
  }

  protected ctaSubtitle(): string {
    const overview = this.overview();
    if (overview === null) return '';
    return this.ctaCaughtUp()
      ? this.translate.instant('admin.overview.cta.caughtUpSubtitle')
      : this.translate.instant('admin.overview.cta.subtitle', {
          hours: overview.reviewTimeTargetHours,
        });
  }

  protected ctaTitle(): string {
    const overview = this.overview();
    if (overview === null) return '';
    if (this.ctaCaughtUp()) return this.translate.instant('admin.overview.cta.caughtUpTitle');
    // Two-form pluralisation idiom (see `CategoryDeleteDialogComponent.hasListingsKey`) —
    // ngx-translate has no ICU/plural-rules support, so `count === 1` gets its own key rather
    // than reusing the "N toys are waiting" string (which hardcodes a plural verb) for N=1.
    const key =
      overview.awaitingReviewCount === 1
        ? 'admin.overview.cta.titleOne'
        : 'admin.overview.cta.title';
    return this.translate.instant(key, { count: overview.awaitingReviewCount });
  }

  // ── Recent moderation feed ──

  protected activityTone(item: AdminActivityItem): ActivityTone {
    return activityTone(item.action);
  }

  /** "**Actor** *verb* target" — composed client-side from `action` + `targetLabel`; a deleted
   *  actor (null first/last name) falls back to a translated "Removed moderator" so the audit
   *  trail never develops a hole, and an unrecognised future `action` string falls back to a
   *  generic line instead of rendering a raw key. */
  protected activityLineText(item: AdminActivityItem): string {
    const actor = activityActorDisplay(item.actorFirstName, item.actorLastName);
    const actorText = actor.isFallback
      ? this.translate.instant('admin.overview.activity.removedActor')
      : actor.name;
    return this.translate.instant(activityLineKey(item.action), {
      actor: actorText,
      target: item.targetLabel,
    });
  }

  /** Relative time, plus — for recategorise/reject rows whose `detailJson` parses cleanly — a
   *  " · extra detail" suffix (from→to category, or the rejection reason). Malformed/absent
   *  `detailJson` just degrades to the plain relative-time line; it never throws. */
  protected activityDetailText(item: AdminActivityItem): string {
    const rel = overviewRelativeTime(item.createdAt);
    const time = this.translate.instant(rel.key, rel.params);

    if (item.action === 'ListingRecategorised') {
      const detail = parseRecategoriseDetail(item.detailJson);
      if (detail) return `${time} · ${detail.fromCategory} → ${detail.toCategory}`;
    }

    if (item.action === 'ListingRejected') {
      const detail = parseRejectDetail(item.detailJson);
      if (detail) {
        const reasonKey = `admin.pendingListings.rejectSheet.reasons.${detail.reasonCode}.title`;
        const reasonLabel = this.translate.instant(reasonKey);
        if (reasonLabel !== reasonKey) return `${time} · ${reasonLabel}`;
      }
    }

    return time;
  }
}
