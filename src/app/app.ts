import { AsyncPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslatePipe } from '@ngx-translate/core';
import { Toast } from 'primeng/toast';
import { combineLatest, distinctUntilChanged, filter, map, timer } from 'rxjs';

import * as AuthActions from './features/auth/store/auth.actions';
import {
  selectAuthInitializing,
  selectAuthUser,
  selectIsAuthenticated,
} from './features/auth/store/auth.selectors';
import { AuthDialogComponent } from './features/auth/components/auth-dialog/auth-dialog.component';
import { ChatBadgeService } from './features/chat/services/chat-badge.service';
import { ChatRealtimeService } from './features/chat/services/chat-realtime.service';
import { NotificationBadgeService } from './features/notifications/services/notification-badge.service';
import { LanguageService } from './shared/services/language.service';
import { AppHeaderComponent } from './shared/ui/app-header/app-header.component';
import { HeaderSearchVisibilityService } from './shared/ui/app-header/header-search-visibility.service';
import { BootScreenComponent } from './shared/ui/boot-screen/boot-screen.component';

interface NavItem {
  readonly path: string;
  readonly labelKey: string;
  readonly exactMatch: boolean;
}

const SCROLL_SHRINK_THRESHOLD = 8;

/** Same breakpoint the header/Home already use to switch to mobile chrome
 *  (see home-page.component.scss:63 / app-header.component.css:752). The
 *  boot screen only ever runs on mobile — evaluated once, see App's
 *  `isMobileAtBoot`. */
const MOBILE_BOOT_MEDIA_QUERY = '(max-width: 960px)';

/** Minimum time the boot screen stays visible even if auth resolves faster,
 *  so a warm boot doesn't strobe the overlay for a single frame. */
const MIN_BOOT_DISPLAY_MS = 600;

interface AppShellViewModel {
  readonly primaryNav: NavItem[];
  readonly isAuthenticated: boolean;
  readonly isGuest: boolean;
  readonly isAuthPending: boolean;
  readonly isAdmin: boolean;
  readonly userDisplayName: string | null;
  readonly userEmail: string | null;
  readonly userInitials: string | null;
}

function isListingDetailsUrl(url: string): boolean {
  const path = url.split('?')[0];
  // Public listing detail (/listings/:id) and owner listing detail (/my-listings/:id)
  // both suppress the global header on mobile and the global bottom nav so each page's
  // own back link + action bar serve as the sole navigation.
  return (
    /^\/listings\/(?!create$)[^/]+$/.test(path) ||
    /^\/my-listings\/[^/]+$/.test(path)
  );
}

function isBookingFlowUrl(url: string): boolean {
  const path = url.split('?')[0];
  return /^\/listings\/[^/]+\/book$/.test(path);
}

function isListingsBrowseUrl(url: string): boolean {
  return url.split('?')[0] === '/listings';
}

function isProfileChildUrl(url: string): boolean {
  const path = url.split('?')[0];
  return /^\/profile\/(toys|rentals|requests|saved)(\/.*)?$/.test(path);
}

function isListingWizardUrl(url: string): boolean {
  const path = url.split('?')[0];
  return path === '/listings/create' || /^\/my-listings\/[^/]+\/edit$/.test(path);
}

export function isHomeUrl(url: string): boolean {
  return url.split('?')[0].split('#')[0] === '/';
}

function isChatUrl(url: string): boolean {
  const path = url.split('?')[0];
  // The chat feature (/chat inbox and /chat/:id thread) is a full-height
  // messaging surface — the global footer is suppressed on all of it.
  return path === '/chat' || path.startsWith('/chat/');
}

function isChatThreadUrl(url: string): boolean {
  const path = url.split('?')[0].split('#')[0];
  // An OPEN chat thread — `/chat/:id` with a non-empty id — is a full-screen
  // messaging surface with no global bottom nav (the inbox `/chat` keeps it).
  // Mirrors `isThreadOpenUrl` in chat-shell.component.ts.
  const match = /^\/chat\/([^/]+)/.exec(path);
  return match !== null && match[1].length > 0;
}

@Component({
  selector: 'app-root',
  imports: [
    AsyncPipe,
    AppHeaderComponent,
    AuthDialogComponent,
    BootScreenComponent,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslatePipe,
    Toast,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly languageService = inject(LanguageService);
  private readonly notificationBadge = inject(NotificationBadgeService);
  private readonly chatBadge = inject(ChatBadgeService);
  private readonly chatRealtime = inject(ChatRealtimeService);
  private readonly headerSearchVisibility = inject(HeaderSearchVisibilityService);

  // Decided ONCE, at construction — a resize mid-boot must not flash the
  // overlay (see the "Mounting" section of the brand-symbol plan). Guarded
  // the same way `map.component.ts`'s `isTouchCapable` is: `matchMedia` may
  // be absent in a test host or an unusually old runtime.
  private readonly isMobileAtBoot: boolean =
    typeof matchMedia === 'function' && matchMedia(MOBILE_BOOT_MEDIA_QUERY).matches;

  // Global unread badge, kept in sync from a single source: the badge service
  // polls the unread-count endpoint while authenticated (there is no realtime
  // transport yet) and the notifications feature updates it after mark-read.
  protected readonly unreadNotifCount = this.notificationBadge.unreadCount;
  // Global unread-chat badge: sums unreadCount across conversations, polled
  // while authenticated (see ChatBadgeService).
  protected readonly unreadChatCount = this.chatBadge.unreadCount;
  protected readonly scrolled          = signal(false);
  protected readonly showFooter        = signal(!isListingDetailsUrl(this.router.url) && !isListingWizardUrl(this.router.url) && !isBookingFlowUrl(this.router.url) && !isChatUrl(this.router.url));
  protected readonly showBottomNav     = signal(!isChatThreadUrl(this.router.url));
  protected readonly isBrowsePage      = signal(isListingsBrowseUrl(this.router.url));
  protected readonly isDetailsPage     = signal(isListingDetailsUrl(this.router.url));
  protected readonly isProfileChildPage = signal(isProfileChildUrl(this.router.url));
  protected readonly isListingWizardPage = signal(isListingWizardUrl(this.router.url));
  protected readonly isBookingPage     = signal(isBookingFlowUrl(this.router.url));
  protected readonly isHomePage        = signal(isHomeUrl(this.router.url));
  protected readonly showAuthDialog    = signal(false);
  protected readonly authDialogMode    = signal<'login' | 'register'>('login');

  // The scroll-revealed header search is a HOME-ONLY behaviour. Gating the
  // service flag on the route here means every other page keeps the header
  // search permanently visible even if Home fails to reset the flag.
  protected readonly headerSearchHidden = computed(
    () => this.isHomePage() && this.headerSearchVisibility.hidden(),
  );

  // ── Mobile app-open boot screen ──────────────────────────────────────
  // Reuses the existing `selectAuthInitializing` selector — no new NgRx
  // state. `isInitializing` in the auth reducer is set true only once, at
  // bootstrap, and never re-entered by login/logout/register (verified
  // against auth.reducer.ts / auth.state.ts — see the doc comment on
  // `AuthState.isInitializing`), so this can never re-show mid-session and
  // needs no "first time only" latch.
  protected readonly isAuthInitializing = this.store.selectSignal(selectAuthInitializing);

  // Minimum boot-screen display time so a warm/fast boot doesn't strobe the
  // overlay for a single frame — flips true once, MIN_BOOT_DISPLAY_MS after
  // construction, independent of how quickly auth resolves.
  protected readonly minBootDisplayElapsed = toSignal(
    timer(MIN_BOOT_DISPLAY_MS).pipe(map(() => true)),
    { initialValue: false },
  );

  // Visible while still initializing OR while the minimum display time
  // hasn't elapsed yet (whichever finishes later) — and only ever on mobile.
  protected readonly showBootScreen = computed(
    () => this.isMobileAtBoot && (this.isAuthInitializing() || !this.minBootDisplayElapsed()),
  );

  protected readonly vm$ = combineLatest({
    isAuthenticated: this.store.select(selectIsAuthenticated),
    isAuthInitializing: this.store.select(selectAuthInitializing),
    user: this.store.select(selectAuthUser),
  }).pipe(
    map(({ isAuthenticated, isAuthInitializing, user }): AppShellViewModel => {
      const isAdmin = user?.roles.includes('Admin') ?? false;

      const primaryNav: NavItem[] = [];

      if (isAuthenticated && isAdmin) {
        primaryNav.push({
          path: '/admin/listings/pending',
          labelKey: 'app.shell.nav.pendingModeration',
          exactMatch: false,
        });
      } else if (isAuthenticated) {
        primaryNav.push(
          {
            path: '/my-listings',
            labelKey: 'app.shell.nav.myListings',
            exactMatch: false,
          },
          {
            path: '/favorites',
            labelKey: 'app.shell.nav.favorites',
            exactMatch: false,
          },
          {
            path: '/bookings',
            labelKey: 'app.shell.nav.bookings',
            exactMatch: true,
          },
          {
            path: '/bookings/requests',
            labelKey: 'app.shell.nav.bookingRequests',
            exactMatch: false,
          },
        );
      }

      const isAuthPending = isAuthInitializing;
      const isGuest = !isAuthenticated && !isAuthInitializing;

      return {
        primaryNav,
        isAuthenticated,
        isGuest,
        isAuthPending,
        isAdmin,
        userDisplayName:
          user === null ? null : `${user.firstName} ${user.lastName}`.trim(),
        userEmail: user?.email ?? null,
        userInitials:
          user === null ? null : ((user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '')).toUpperCase() || null,
      };
    }),
  );

  constructor() {
    this.store.dispatch(AuthActions.authInitStarted());
    this.languageService.hydrate();

    // Drive the global notification badge poller off auth state.
    this.store
      .select(selectIsAuthenticated)
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((isAuthenticated) => {
        if (isAuthenticated) {
          this.notificationBadge.start();
          this.chatBadge.start();
          this.chatRealtime.start();
        } else {
          this.notificationBadge.stop();
          this.chatBadge.stop();
          this.chatRealtime.stop();
        }
      });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        const url = event.urlAfterRedirects;
        this.showFooter.set(!isListingDetailsUrl(url) && !isListingWizardUrl(url) && !isBookingFlowUrl(url) && !isChatUrl(url));
        this.showBottomNav.set(!isChatThreadUrl(url));
        this.isBrowsePage.set(isListingsBrowseUrl(url));
        this.isDetailsPage.set(isListingDetailsUrl(url));
        this.isProfileChildPage.set(isProfileChildUrl(url));
        this.isListingWizardPage.set(isListingWizardUrl(url));
        this.isBookingPage.set(isBookingFlowUrl(url));
        this.isHomePage.set(isHomeUrl(url));
      });
  }

  protected openAuthDialog(mode: 'login' | 'register'): void {
    this.authDialogMode.set(mode);
    this.showAuthDialog.set(true);
  }

  protected onSignOut(): void {
    this.store.dispatch(AuthActions.logout());
  }

  @HostListener('window:scroll')
  protected onWindowScroll(): void {
    const nextScrolled = window.scrollY > SCROLL_SHRINK_THRESHOLD;
    if (nextScrolled !== this.scrolled()) {
      this.scrolled.set(nextScrolled);
    }
  }
}
