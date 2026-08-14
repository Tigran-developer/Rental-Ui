import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** `(min-width: 961px)` — the shell breakpoint used across the admin console (matches
 *  `styles.css`'s shell-md token, 960px). */
const DESKTOP_MEDIA_QUERY = '(min-width: 961px)';

/**
 * Centralises the desktop-vs-mobile breakpoint check every admin console screen needs to pick
 * between its desktop and mobile layout branch (`AdminShellComponent`'s rail vs. bottom-nav,
 * and the same responsive split in `categories-page` / `inspect-page` / `reports-page` /
 * `review-page` / `users-page`). Previously each of those six components carried its own
 * verbatim copy of the `matchMedia` check, an `isDesktop` signal, and a
 * `@HostListener('window:resize')` — this service replaces all six with one shared, app-wide
 * `resize` listener. `providedIn: 'root'` so every consumer shares the same signal and listener
 * rather than each page paying for its own.
 */
@Injectable({ providedIn: 'root' })
export class AdminBreakpointService {
  private readonly desktopState = signal<boolean>(this.matchesDesktop());

  /** True at `(min-width: 961px)` and above. Reactive — flips on `window:resize`. */
  readonly isDesktop = this.desktopState.asReadonly();

  constructor() {
    const onResize = (): void => {
      const next = this.matchesDesktop();
      if (next !== this.desktopState()) this.desktopState.set(next);
    };
    window.addEventListener('resize', onResize);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('resize', onResize));
  }

  private matchesDesktop(): boolean {
    return typeof matchMedia === 'function' && matchMedia(DESKTOP_MEDIA_QUERY).matches;
  }
}
