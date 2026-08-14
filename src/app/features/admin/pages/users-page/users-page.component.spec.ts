import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';

import { makeAdminUser } from '../../../../../testing/fixtures';
import { actionsHarness, type ActionsHarness } from '../../../../../testing/ngrx.helpers';
import * as AdminUsersActions from '../../store/admin-users.actions';
import { adminUsersFeatureKey } from '../../store/admin-users.reducer';
import { initialAdminUsersState } from '../../store/admin-users.state';
import { UsersPageComponent } from './users-page.component';

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

describe('UsersPageComponent', () => {
  let fixture: ComponentFixture<UsersPageComponent>;
  let store: MockStore;
  let router: { navigate: ReturnType<typeof vi.fn> };
  // UsersPageComponent injects NgRx's `Actions` stream directly (to apply a verify/suspend/
  // reactivate mutation's fresh server row to an open profile dialog even when the row leaves
  // the current status tab) — provideMockStore alone doesn't supply that, so every test needs
  // the same `provideMockActions` harness the effects specs use. Same idiom as
  // `inspect-page.component.spec.ts` / `reports-page.component.spec.ts`.
  let harness: ActionsHarness;

  async function setup(
    overrides: Partial<typeof initialAdminUsersState> = {},
    desktop = true,
  ): Promise<void> {
    mockMatchMedia(desktop);
    router = { navigate: vi.fn() };
    harness = actionsHarness();
    await TestBed.configureTestingModule({
      imports: [UsersPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: Router, useValue: router },
        harness.provider,
        provideMockStore({
          initialState: { [adminUsersFeatureKey]: { ...initialAdminUsersState, ...overrides } },
        }),
      ],
    }).compileComponents();
    store = TestBed.inject(MockStore);
    fixture = TestBed.createComponent(UsersPageComponent);
    fixture.detectChanges();
  }

  it('dispatches loadUserQueue on init', async () => {
    const dispatchSpy = vi.fn();
    mockMatchMedia(true);
    router = { navigate: vi.fn() };
    harness = actionsHarness();
    await TestBed.configureTestingModule({
      imports: [UsersPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: Router, useValue: router },
        harness.provider,
        provideMockStore({ initialState: { [adminUsersFeatureKey]: initialAdminUsersState } }),
      ],
    }).compileComponents();
    store = TestBed.inject(MockStore);
    vi.spyOn(store, 'dispatch').mockImplementation(dispatchSpy);
    fixture = TestBed.createComponent(UsersPageComponent);
    fixture.detectChanges();

    expect(dispatchSpy).toHaveBeenCalledWith(AdminUsersActions.loadUserQueue());
  });

  it('shows the skeleton while loading with no items yet', async () => {
    await setup({ isLoading: true, items: [] });
    expect(
      fixture.nativeElement.querySelectorAll('.users-page__skeleton-row').length,
    ).toBeGreaterThan(0);
  });

  it('shows the empty state once loaded with no users', async () => {
    await setup({ isLoading: false, items: [] });
    expect(fixture.nativeElement.querySelector('app-ui-empty-state')).not.toBeNull();
  });

  it('renders one row per user on desktop', async () => {
    await setup({
      isLoading: false,
      items: [makeAdminUser({ id: 'u1' }), makeAdminUser({ id: 'u2' })],
    });
    expect(fixture.nativeElement.querySelectorAll('.users-page__row').length).toBe(2);
  });

  it('dispatches setUserStatusFilter when a tab is selected', async () => {
    await setup({
      summary: { totalUsers: 3, verifiedCount: 1, pendingCount: 1, suspendedCount: 1 },
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const pendingTab: HTMLButtonElement | null = Array.from(
      fixture.nativeElement.querySelectorAll('.admin-tabs__tab'),
    ).find((el) =>
      (el as HTMLElement).textContent?.includes('admin.users.tabs.pending'),
    ) as HTMLButtonElement | null;
    expect(pendingTab).not.toBeNull();
    pendingTab?.click();
    expect(dispatchSpy).toHaveBeenCalledWith(
      AdminUsersActions.setUserStatusFilter({ status: 'pending' }),
    );
  });

  it('opens the profile dialog when a user row is clicked', async () => {
    await setup({ items: [makeAdminUser({ id: 'u1' })] });
    expect(fixture.nativeElement.querySelector('app-admin-user-profile-dialog')).toBeNull();

    const avatarBtn: HTMLButtonElement =
      fixture.nativeElement.querySelector('.users-page__avatar-btn');
    avatarBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-admin-user-profile-dialog')).not.toBeNull();
  });

  describe('profile dialog stays in sync with a mutation made from inside it', () => {
    it('shows Reactivate (not Suspend) once suspendUserSuccess fires, even though the row has left the Pending tab', async () => {
      const pendingUser = makeAdminUser({
        id: 'u1',
        status: 'Pending',
        isIdConfirmed: false,
        flagCount: 0,
      });
      // `statusFilter: 'pending'` + `items` containing only the still-Pending row simulates the
      // bug scenario: the row has already been dropped from the filtered list the mutation's own
      // optimistic patch would produce, so the fix must not depend on `items()` picking the row
      // back up.
      await setup({ statusFilter: 'pending', items: [pendingUser] });

      const avatarBtn: HTMLButtonElement =
        fixture.nativeElement.querySelector('.users-page__avatar-btn');
      avatarBtn.click();
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('.admin-user-profile-dialog__action--danger'),
      ).not.toBeNull();
      expect(
        fixture.nativeElement.querySelector('.admin-user-profile-dialog__action--success'),
      ).toBeNull();

      const suspendedUser = makeAdminUser({ id: 'u1', status: 'Suspended', isIdConfirmed: false });
      harness.send(AdminUsersActions.suspendUserSuccess({ userId: 'u1', user: suspendedUser }));
      fixture.detectChanges();

      // Suspend is gone, Reactivate is now the only status action — the dialog reflects the
      // user's new true state instead of freezing on "Pending".
      expect(
        fixture.nativeElement.querySelector('.admin-user-profile-dialog__action--danger'),
      ).toBeNull();
      const reactivateBtn = fixture.nativeElement.querySelector(
        '.admin-user-profile-dialog__action--success',
      );
      expect(reactivateBtn).not.toBeNull();
    });

    it('ignores a success for a different user id', async () => {
      const pendingUser = makeAdminUser({ id: 'u1', status: 'Pending', isIdConfirmed: false });
      await setup({ statusFilter: 'pending', items: [pendingUser] });

      const avatarBtn: HTMLButtonElement =
        fixture.nativeElement.querySelector('.users-page__avatar-btn');
      avatarBtn.click();
      fixture.detectChanges();

      harness.send(
        AdminUsersActions.suspendUserSuccess({
          userId: 'someone-else',
          user: makeAdminUser({ id: 'someone-else', status: 'Suspended' }),
        }),
      );
      fixture.detectChanges();

      // Still showing u1's Pending/Suspend state — the dialog only reacts to a success matching
      // the currently open profile.
      expect(
        fixture.nativeElement.querySelector('.admin-user-profile-dialog__action--danger'),
      ).not.toBeNull();
    });

    it('on failure, keeps the dialog on the true prior (Pending) state and surfaces the error instead of an optimistic value', async () => {
      const pendingUser = makeAdminUser({ id: 'u1', status: 'Pending', isIdConfirmed: false });
      // The row is absent from `items()` the same way `beginMutation`'s optimistic patch would
      // leave it (removed from the Pending tab as soon as the suspend request is in flight) —
      // the dialog's snapshot must NOT follow it there; it should stay showing the pre-mutation
      // data it was opened with.
      await setup({ statusFilter: 'pending', items: [], error: 'Something went wrong' });

      // Opened directly (bypassing the row click, since the row isn't in `items()` any more) the
      // same way `openProfile` is invoked from a row/card click.
      fixture.componentInstance['openProfile'](pendingUser);
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('.admin-user-profile-dialog__action--danger'),
      ).not.toBeNull();

      harness.send(
        AdminUsersActions.suspendUserFailure({
          userId: 'u1',
          error: 'Something went wrong',
          errorCode: null,
        }),
      );
      fixture.detectChanges();

      // No stale/optimistic "Suspended" state leaked into the dialog on failure.
      expect(
        fixture.nativeElement.querySelector('.admin-user-profile-dialog__action--danger'),
      ).not.toBeNull();
      expect(
        fixture.nativeElement.querySelector('.admin-user-profile-dialog__action--success'),
      ).toBeNull();
      // The page-level error banner surfaces the failure.
      const errorBanner = fixture.nativeElement.querySelector('.users-page__error');
      expect(errorBanner).not.toBeNull();
      expect(errorBanner.textContent).toContain('Something went wrong');
    });
  });
});
