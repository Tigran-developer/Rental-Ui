import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { TranslatePipe } from '@ngx-translate/core';
import { filter } from 'rxjs';

import { selectAuthUser } from '../../../auth/store/auth.selectors';
import { AvatarComponent } from '../../../../shared/ui/avatar/avatar.component';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import * as AdminModerationActions from '../../store/admin-moderation.actions';
import { selectQueueCounts, selectQueueLoading } from '../../store/admin-moderation.selectors';
import * as AdminOverviewActions from '../../store/admin-overview.actions';
import { selectOverview } from '../../store/admin-overview.selectors';
import { AdminBreakpointService } from '../../utils/admin-breakpoint.service';

type AdminNavId = 'overview' | 'review' | 'categories' | 'users' | 'reports';

interface AdminNavItem {
  readonly id: AdminNavId;
  readonly path: string;
  readonly labelKey: string;
  readonly icon: string;
  /** admin-mobile.jsx's `AdminMobileNav` uses a different icon than the
   *  desktop rail for one tab ('home' vs 'grid' for Overview) — defaults to
   *  `icon` when unset. */
  readonly mobileIcon?: string;
  /** Whether this item shows a meta value at all (design: Overview/Users
   *  show none). */
  readonly hasMeta?: boolean;
  /** Meta rendered as a colour-filled pill (review/reports) vs. plain muted
   *  text (categories) — see `AdminRail`'s `m.badge` ternary. */
  readonly badge?: boolean;
}

/**
 * Left-rail / bottom-nav destinations. `path` is relative to `/admin` —
 * matches the child routes declared in `../../routes.ts`.
 */
const NAV_ITEMS: readonly AdminNavItem[] = [
  {
    id: 'overview',
    path: '/admin/overview',
    labelKey: 'admin.console.nav.overview',
    icon: 'grid',
    mobileIcon: 'home',
  },
  {
    id: 'review',
    path: '/admin/review',
    labelKey: 'admin.console.nav.review',
    icon: 'shield',
    hasMeta: true,
    badge: true,
  },
  {
    id: 'categories',
    path: '/admin/categories',
    labelKey: 'admin.console.nav.categories',
    icon: 'tag',
    hasMeta: true,
  },
  { id: 'users', path: '/admin/users', labelKey: 'admin.console.nav.users', icon: 'user' },
  {
    id: 'reports',
    path: '/admin/reports',
    labelKey: 'admin.console.nav.reports',
    icon: 'flag',
    hasMeta: true,
    badge: true,
  },
];

/**
 * Admin console chrome — routed layout for everything under `/admin`.
 * Reproduces the design's `AdminTopBar` + `AdminRail` (desktop, ≥961px) and
 * `AdminMobileHeader` + `AdminMobileNav` (mobile, <961px).
 *
 * ── Design source note ──────────────────────────────────────────────────
 * The `DesignSync` tool and the `admin-desktop.jsx` / `admin-mobile.jsx` /
 * `admin-shared.jsx` files it was meant to serve (project
 * df24299b-1299-4804-8a0a-5484005594c3) were not available in this
 * environment — no such tool is registered, and no matching files exist
 * anywhere on disk (searched the full filesystem and the repo's
 * `.ai-context/` design archives). The only usable design source found was
 * `.ai-context/claude-design-current/system.jsx`, an earlier snapshot of
 * this same "Direction A · Refined Warm" system (its `TOKENS.A` values match
 * this repo's `--ui-color-*` tokens 1:1 — confirmed value-by-value), which
 * supplied most of the new icon glyphs (see icon.component.ts) but has no
 * `AdminTopBar`/`AdminRail`/`AdminShell` markup to copy measurements from.
 * Layout, spacing, and structure below follow the task's own explicit
 * textual spec (64px topbar, 244px rail, named tokens) — flagged in the
 * implementation report rather than guessed silently.
 */
@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [
    AvatarComponent,
    IconComponent,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslatePipe,
  ],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShellComponent {
  private readonly store = inject(Store);
  private readonly router = inject(Router);

  protected readonly navItems = NAV_ITEMS;

  private readonly user = this.store.selectSignal(selectAuthUser);

  protected readonly userDisplayName = computed(() => {
    const user = this.user();
    return user === null ? null : `${user.firstName} ${user.lastName}`.trim();
  });

  protected readonly userInitials = computed(() => {
    const user = this.user();
    if (user === null) return null;
    return ((user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '')).toUpperCase() || null;
  });

  // ── Responsive branch: desktop rail chrome vs. mobile header+bottom-nav.
  // Decided reactively (not once at construction, unlike App's boot-screen
  // flag) because the admin shell is a persistent layout a moderator can
  // resize the window under — see the app.ts `isMobileAtBoot` doc comment
  // for why that one is a one-shot decision and this one isn't. Sourced from
  // `AdminBreakpointService` (shared across every admin console screen) rather than a
  // component-local `matchMedia` + `resize` listener.
  private readonly breakpoint = inject(AdminBreakpointService);
  protected readonly isDesktop = this.breakpoint.isDesktop;

  // ── Nav counts: `review`'s badge is the same `adminModeration` queue state
  // the review-page reads (provided once at the parent `/admin` route). The
  // shell dispatches its own `loadListingQueue()` below so the badge is
  // accurate even when the admin is on a *different* tab and hasn't visited
  // `/admin/review` yet — while that first load is in flight, `null` renders
  // the skeleton rather than a misleading "0". `categories`/`reports` are the
  // same idiom against `adminOverview` state (GET /api/admin/overview,
  // dispatched below) — `overview` and `users` show no meta at all (see
  // `NAV_ITEMS`, `hasMeta` unset for both), so there is nothing to wire for
  // them.
  private readonly queueCounts = this.store.selectSignal(selectQueueCounts);
  private readonly queueLoading = this.store.selectSignal(selectQueueLoading);
  private readonly overview = this.store.selectSignal(selectOverview);

  protected readonly navCounts = computed<Record<AdminNavId, number | null>>(() => {
    const overview = this.overview();
    return {
      overview: null,
      review: this.queueLoading() ? null : this.queueCounts().pending,
      categories: overview !== null ? overview.categoryCount : null,
      users: null,
      reports: overview !== null ? overview.openReportCount : null,
    };
  });

  /** `hasAvgReviewData` is distinct from `avgReviewHours !== null`: the former tells the
   *  template whether `overview` has loaded at all (gates the loading skeleton, same as
   *  `pendingCount`), the latter is `averageReviewTimeMinutes`'s own null-vs-zero distinction
   *  (see `AdminOverview`'s doc comment) — "nothing moderated in the trailing 30 days" renders
   *  as a dash once loaded, not an eternally-pulsing skeleton. */
  protected readonly queueHealth = computed<{
    pendingCount: number | null;
    avgReviewHours: number | null;
    hasAvgReviewData: boolean;
    flaggedCount: number | null;
  }>(() => {
    const overview = this.overview();
    if (overview === null) {
      return {
        pendingCount: null,
        avgReviewHours: null,
        hasAvgReviewData: false,
        flaggedCount: null,
      };
    }
    return {
      pendingCount: overview.awaitingReviewCount,
      avgReviewHours:
        overview.averageReviewTimeMinutes !== null
          ? Math.round((overview.averageReviewTimeMinutes / 60) * 10) / 10
          : null,
      hasAvgReviewData: overview.averageReviewTimeMinutes !== null,
      flaggedCount: overview.openReportCount,
    };
  });

  // ── Mobile sticky header title: the active nav item's label. Derived from
  // the URL (not route `data`) so it stays correct through the
  // `listings/pending` → `review` redirect without extra route wiring.
  protected readonly activeNavItem = signal<AdminNavItem | null>(
    this.findActiveNavItem(this.router.url),
  );

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.activeNavItem.set(this.findActiveNavItem(event.urlAfterRedirects));
      });

    // Loads once per shell mount (persists across `/admin/*` child
    // navigation) so the review badge is accurate regardless of which admin
    // tab is active — see the `navCounts` doc comment above.
    this.store.dispatch(AdminModerationActions.loadListingQueue());

    // Same idiom for `adminOverview` — loads once per shell mount so the categories/reports
    // badges and the queue-health panel are accurate regardless of which admin tab is active.
    // `OverviewPageComponent` shares this same fetch rather than re-requesting it: it only
    // dispatches its own `loadOverview()` when the store doesn't already have (or isn't already
    // fetching) the data — see that component's constructor doc comment.
    this.store.dispatch(AdminOverviewActions.loadOverview());
  }

  private findActiveNavItem(url: string): AdminNavItem | null {
    const path = url.split('?')[0];
    return (
      this.navItems.find((item) => path === item.path || path.startsWith(`${item.path}/`)) ?? null
    );
  }
}
