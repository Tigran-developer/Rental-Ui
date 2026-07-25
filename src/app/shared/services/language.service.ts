import { Injectable, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';

import * as AuthActions from '../../features/auth/store/auth.actions';

export type LanguageCode = 'en' | 'hy' | 'ru';

export interface LanguageOption {
  readonly code: LanguageCode;
  readonly flag: string;
  /** Name written in the language's own script (e.g. "Հայերեն"). */
  readonly native: string;
  /** English name of the language (e.g. "Armenian"). */
  readonly label: string;
}

const LANGUAGE_STORAGE_KEY = 'stayfinder.lang';

const LANGUAGES: readonly LanguageOption[] = [
  { code: 'en', flag: '🇬🇧', native: 'English', label: 'English' },
  { code: 'hy', flag: '🇦🇲', native: 'Հայերեն', label: 'Armenian' },
  { code: 'ru', flag: '🇷🇺', native: 'Русский', label: 'Russian' },
];

/**
 * Single source of truth for the app's current display language.
 *
 * Owns the `localStorage` persistence and the `TranslateService.use()` call
 * that used to be duplicated between the app shell (guest-facing hydration on
 * boot) and the profile page (the only place a signed-in user could change
 * language). Both now delegate here; a third, guest-facing entry point (the
 * header dropdown / mobile sheet) reads and writes through the same service.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);
  private readonly store = inject(Store);

  readonly languages: readonly LanguageOption[] = LANGUAGES;

  /** The active language. Resolved from storage at construction time. */
  readonly current = signal<LanguageOption>(this.resolveInitial());

  /** Applies the resolved language to ngx-translate. Call once, on app boot. */
  hydrate(): void {
    this.translate.use(this.current().code);
  }

  /**
   * Inbound path: applies the language a signed-in user has saved on the
   * server (called from `AuthEffects` on `loadCurrentUserSuccess`, i.e. app
   * boot with a token and post-login/register/external-auth).
   *
   * No-ops when `code` is null/undefined/unknown — a user with no saved
   * preference keeps whatever is already active (localStorage/default).
   * Never persists back to the backend; only the outbound `use()` does that,
   * so applying a server value can never trigger a re-persist loop.
   */
  applyFromUser(code: string | null | undefined): void {
    if (code === null || code === undefined) return;
    const option = this.languages.find((l) => l.code === code);
    if (option === undefined) return;
    this.applyLocally(option);
  }

  /**
   * Outbound path: user-initiated language switch. Updates state, ngx-translate,
   * and localStorage, then dispatches `AuthActions.updatePreferredLanguage` so
   * `AuthEffects` can persist it to the backend when the user is authenticated
   * (a no-op while signed out — localStorage-only, same as before).
   */
  use(code: LanguageCode): void {
    const option = this.languages.find((l) => l.code === code) ?? this.languages[0];
    this.applyLocally(option);
    this.store.dispatch(AuthActions.updatePreferredLanguage({ code: option.code }));
  }

  private applyLocally(option: LanguageOption): void {
    this.current.set(option);
    this.translate.use(option.code);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, option.code);
    } catch {
      /* ignore (private browsing / storage disabled) */
    }
  }

  private resolveInitial(): LanguageOption {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return this.languages.find((l) => l.code === stored) ?? this.languages[0];
  }
}
