import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Actions, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { TranslatePipe } from '@ngx-translate/core';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { debounceTime, distinctUntilChanged, filter, skip } from 'rxjs';

import { AvatarComponent } from '../../../../shared/ui/avatar/avatar.component';
import { EmptyStateComponent } from '../../../../shared/ui/empty-state/empty-state.component';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { selectAuthUser } from '../../../auth/store/auth.selectors';
import { AdminPageHeaderComponent } from '../../components/admin-page-header/admin-page-header.component';
import { AdminStatCardComponent } from '../../components/admin-stat-card/admin-stat-card.component';
import {
  AdminTabsComponent,
  type AdminTabItem,
} from '../../components/admin-tabs/admin-tabs.component';
import { AdminUserActionsPanelComponent } from '../../components/admin-user-actions-panel/admin-user-actions-panel.component';
import { AdminUserProfileDialogComponent } from '../../components/admin-user-profile-dialog/admin-user-profile-dialog.component';
import { AdminUserStatusPillComponent } from '../../components/admin-user-status-pill/admin-user-status-pill.component';
import type {
  AdminUser,
  AdminUserSortOption,
  AdminUserStatusFilter,
} from '../../models/admin-user.model';
import * as AdminUsersActions from '../../store/admin-users.actions';
import {
  selectUserActionIds,
  selectUserError,
  selectUserItems,
  selectUserLoading,
  selectUserPage,
  selectUserSearch,
  selectUserSort,
  selectUserStatusFilter,
  selectUserSummary,
  selectUserTotalPages,
} from '../../store/admin-users.selectors';
import { AdminBreakpointService } from '../../utils/admin-breakpoint.service';
import { canSuspendUser, suspendDisabledReasonKey } from '../../utils/admin-user-guards.util';

const SORT_OPTIONS: readonly { id: AdminUserSortOption; labelKey: string }[] = [
  { id: 'name', labelKey: 'admin.users.sort.name' },
  { id: 'newest', labelKey: 'admin.users.sort.newest' },
  { id: 'listings', labelKey: 'admin.users.sort.listings' },
  { id: 'rentals', labelKey: 'admin.users.sort.rentals' },
  { id: 'flags', labelKey: 'admin.users.sort.flags' },
];

/**
 * `/admin/users` — the redesigned Users screen (`AdminUsersDesktop` / `AdminUsersMobile`).
 * `admin-placeholder-page` (the generic "Coming soon" body every admin route used before its
 * phase landed) has since been fully retired — every `/admin/*` route now has a real page (see
 * `routes.ts`).
 *
 * The reports deep-link query param is `userId` (`/admin/reports?userId=<id>`) — chosen
 * because it's the exact name the task's own spec example used; the Reports screen (next
 * task) should read that same param name.
 */
@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [
    AdminPageHeaderComponent,
    AdminStatCardComponent,
    AdminTabsComponent,
    AdminUserActionsPanelComponent,
    AdminUserProfileDialogComponent,
    AdminUserStatusPillComponent,
    AvatarComponent,
    DatePipe,
    EmptyStateComponent,
    IconComponent,
    MessageModule,
    SkeletonModule,
    TranslatePipe,
  ],
  templateUrl: './users-page.component.html',
  styleUrl: './users-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersPageComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly actions$ = inject(Actions);

  private readonly breakpoint = inject(AdminBreakpointService);
  protected readonly isDesktop = this.breakpoint.isDesktop;

  // ── Store state ──
  protected readonly items = this.store.selectSignal(selectUserItems);
  protected readonly statusFilter = this.store.selectSignal(selectUserStatusFilter);
  protected readonly sort = this.store.selectSignal(selectUserSort);
  protected readonly summary = this.store.selectSignal(selectUserSummary);
  protected readonly isLoading = this.store.selectSignal(selectUserLoading);
  protected readonly error = this.store.selectSignal(selectUserError);
  protected readonly actionIds = this.store.selectSignal(selectUserActionIds);
  protected readonly page = this.store.selectSignal(selectUserPage);
  protected readonly totalPages = this.store.selectSignal(selectUserTotalPages);
  private readonly storeSearch = this.store.selectSignal(selectUserSearch);

  private readonly currentUser = this.store.selectSignal(selectAuthUser);
  protected readonly currentUserId = computed(() => this.currentUser()?.id ?? null);

  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly sortLabelKey = computed(
    () =>
      SORT_OPTIONS.find((option) => option.id === this.sort())?.labelKey ??
      SORT_OPTIONS[0].labelKey,
  );

  protected readonly tabs = computed<AdminTabItem[]>(() => {
    const s = this.summary();
    return [
      { id: 'all', labelKey: 'admin.users.tabs.all', count: s.totalUsers },
      { id: 'pending', labelKey: 'admin.users.tabs.pending', count: s.pendingCount },
      { id: 'suspended', labelKey: 'admin.users.tabs.suspended', count: s.suspendedCount },
    ];
  });

  protected readonly showInitialSkeleton = computed(
    () => this.isLoading() && this.items().length === 0,
  );
  protected readonly showEmpty = computed(
    () => !this.isLoading() && this.items().length === 0 && this.error() === null,
  );
  /** Stat cards show their built-in skeleton until the first load settles. */
  protected readonly statsReady = computed(() => !this.showInitialSkeleton());

  // ── Search (debounced 300ms, same delay as `listings-filters`) ──
  protected readonly searchInput = signal(this.storeSearch());

  // ── Sort dropdown (desktop popover / mobile sheet, single instance on the page) ──
  protected readonly sortMenuOpen = signal(false);
  @ViewChild('sortTrigger') private readonly sortTriggerRef?: ElementRef<HTMLButtonElement>;

  // ── Row actions menu (desktop popover / mobile sheet) — only one open at a time ──
  protected readonly openMenuUserId = signal<string | null>(null);

  // ── Profile dialog ──
  private readonly profileUserId = signal<string | null>(null);
  private readonly profileSnapshot = signal<AdminUser | null>(null);
  protected readonly profileUser = computed(() => this.profileSnapshot());

  constructor() {
    // `toObservable` emits the current value immediately on subscribe — `skip(1)` drops that
    // initial replay so mount doesn't fire a second, redundant `loadUserQueue` alongside
    // `ngOnInit`'s.
    toObservable(this.searchInput)
      .pipe(skip(1), debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((search) => {
        this.store.dispatch(AdminUsersActions.setUserSearch({ search }));
      });

    // Keeps an open profile dialog's data live (status/flagCount/etc. after a mutation)
    // without closing it just because the row temporarily leaves the current tab's filtered
    // list — e.g. suspending a user from inside their own profile dialog while on the "All"
    // tab should keep the dialog open showing "Suspended", not vanish because the row's index
    // shifted.
    effect(() => {
      const id = this.profileUserId();
      if (id === null) return;
      const live = this.items().find((item) => item.id === id);
      if (live) this.profileSnapshot.set(live);
    });

    // The `effect()` above only catches a mutation whose result still matches the current
    // status tab — e.g. suspending a user while on the "Suspended" or "All" tab, where the row
    // stays in `items()`. Suspending from inside the dialog while on "Pending ID" moves the row
    // OFF that tab, so it drops out of `items()` and the effect never fires again, leaving the
    // dialog frozen on stale data. This subscription applies verify/suspend/reactivate's fresh
    // server row straight to the snapshot on success, independent of the current filter — reuses
    // the mutation response `admin-users-api.service.ts` already returns, no extra network
    // round-trip. Same `Actions`-in-a-page-component idiom as `inspect-page.component.ts`'s
    // approve/reject-success listener. Rollback on failure needs no matching subscription:
    // `rollbackMutation` (`admin-users.reducer.ts`) restores the row to its pre-mutation value at
    // its pre-mutation index — since that's exactly where it matched the tab before the mutation
    // started, it reappears in `items()` and the `effect()` above picks it back up.
    this.actions$
      .pipe(
        ofType(
          AdminUsersActions.verifyUserSuccess,
          AdminUsersActions.suspendUserSuccess,
          AdminUsersActions.reactivateUserSuccess,
        ),
        filter(({ userId }) => userId === this.profileUserId()),
        takeUntilDestroyed(),
      )
      .subscribe(({ user }) => {
        this.profileSnapshot.set(user);
      });
  }

  ngOnInit(): void {
    this.store.dispatch(AdminUsersActions.loadUserQueue());
  }

  protected displayName(user: AdminUser): string {
    return `${user.firstName} ${user.lastName}`.trim() || user.email;
  }

  protected onSearchInput(event: Event): void {
    this.searchInput.set((event.target as HTMLInputElement).value);
  }

  protected retry(): void {
    this.store.dispatch(AdminUsersActions.loadUserQueue());
  }

  protected selectTab(status: string): void {
    this.openMenuUserId.set(null);
    this.store.dispatch(
      AdminUsersActions.setUserStatusFilter({ status: status as AdminUserStatusFilter }),
    );
  }

  protected goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.store.dispatch(AdminUsersActions.setUserPage({ page }));
  }

  // ── Sort ──
  protected toggleSortMenu(): void {
    this.sortMenuOpen.update((open) => !open);
  }

  protected closeSortMenu(): void {
    this.sortMenuOpen.set(false);
  }

  protected selectSort(sortOption: AdminUserSortOption): void {
    this.sortMenuOpen.set(false);
    this.sortTriggerRef?.nativeElement.focus();
    this.store.dispatch(AdminUsersActions.setUserSort({ sort: sortOption }));
  }

  protected onSortKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.sortMenuOpen.set(false);
    this.sortTriggerRef?.nativeElement.focus();
  }

  // ── Row actions menu ──
  protected isMenuOpen(userId: string): boolean {
    return this.openMenuUserId() === userId;
  }

  protected toggleMenu(userId: string): void {
    this.openMenuUserId.set(this.isMenuOpen(userId) ? null : userId);
  }

  protected closeMenu(): void {
    this.openMenuUserId.set(null);
  }

  protected isBusy(userId: string): boolean {
    return this.actionIds().includes(userId);
  }

  protected canSuspend(user: AdminUser): boolean {
    return canSuspendUser(user, this.currentUserId());
  }

  protected suspendReasonKey(user: AdminUser): string | null {
    return suspendDisabledReasonKey(user, this.currentUserId());
  }

  protected verify(userId: string): void {
    this.store.dispatch(AdminUsersActions.verifyUser({ userId }));
  }

  protected suspend(user: AdminUser): void {
    if (!this.canSuspend(user)) return;
    this.store.dispatch(AdminUsersActions.suspendUser({ userId: user.id }));
  }

  protected reactivate(userId: string): void {
    this.store.dispatch(AdminUsersActions.reactivateUser({ userId }));
  }

  // ── Profile dialog ──
  protected openProfile(user: AdminUser): void {
    this.openMenuUserId.set(null);
    this.profileUserId.set(user.id);
    this.profileSnapshot.set(user);
  }

  protected closeProfile(): void {
    this.profileUserId.set(null);
    this.profileSnapshot.set(null);
  }

  // ── Reports deep link ──
  protected viewReports(userId: string): void {
    void this.router.navigate(['/admin/reports'], { queryParams: { userId } });
  }
}
