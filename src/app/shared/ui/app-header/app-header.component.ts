import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { DorentSymbolComponent } from '../dorent-symbol/dorent-symbol.component';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    DorentSymbolComponent,
    LanguageSelectorComponent,
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
  ],
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'banner',
    '[class.nh--scrolled]': 'scrolled()',
    '[class.nh--search-hidden]': 'searchHidden()',
  },
})
export class AppHeaderComponent {
  private readonly router = inject(Router);

  readonly scrolled        = input(false);
  /**
   * Fades the search pill out and removes it from the tab order. Driven by the
   * app shell; only Home ever sets it (see HeaderSearchVisibilityService).
   */
  readonly searchHidden    = input(false);
  readonly isAuthenticated = input(false);
  readonly isAuthPending   = input(false);
  readonly userDisplayName = input<string | null>(null);
  readonly userInitials    = input<string | null>(null);
  readonly unreadNotifCount = input(0);
  readonly unreadChatCount = input(0);
  readonly myToysCount     = input(0);
  readonly myRentalsCount  = input(0);
  readonly requestsCount   = input(0);
  readonly savedCount      = input(0);

  readonly signOutClick  = output<void>();
  readonly openAuthClick = output<'login' | 'register'>();

  protected readonly profileOpen  = signal(false);
  protected readonly searchQuery  = signal('');
  /** Drives the brand mark's bounce loop — hover OR keyboard focus, so the
   *  animation has focus parity for free (see dorent-symbol.component.ts). */
  protected readonly brandHovered = signal(false);

  protected readonly userFirstName = computed(
    () => (this.userDisplayName() ?? '').split(' ')[0] || ''
  );

  private profileCloseTimer: ReturnType<typeof setTimeout> | null = null;

  protected openProfileMenu(): void {
    if (this.profileCloseTimer !== null) {
      clearTimeout(this.profileCloseTimer);
      this.profileCloseTimer = null;
    }
    this.profileOpen.set(true);
  }

  protected scheduleCloseProfileMenu(): void {
    this.profileCloseTimer = setTimeout(() => {
      this.profileOpen.set(false);
      this.profileCloseTimer = null;
    }, 150);
  }

  protected onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  protected onSearchSubmit(): void {
    const q = this.searchQuery().trim();
    void this.router.navigate(['/listings'], {
      queryParams: { q: q || null },
      queryParamsHandling: 'merge',
    });
  }

  protected onSignOut(): void {
    this.profileOpen.set(false);
    this.signOutClick.emit();
  }

  protected onOpenAuth(mode: 'login' | 'register'): void {
    this.openAuthClick.emit(mode);
  }

  protected closeProfile(): void {
    this.profileOpen.set(false);
  }

  protected onBrandHoverChange(hovered: boolean): void {
    this.brandHovered.set(hovered);
  }
}
