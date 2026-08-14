import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostBinding,
  HostListener,
  OnDestroy,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AvatarComponent } from '../../../../shared/ui/avatar/avatar.component';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import type { AdminUser } from '../../models/admin-user.model';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Row-level actions — the design's per-row kebab dropdown (desktop, `AdminUsersDesktop`'s
 * inline menu) and per-row bottom sheet (mobile, `AdminUsersMobile`'s `sheet` state), unified
 * into one component the way `CategoryDeleteDialogComponent` unifies its centered-modal vs
 * bottom-sheet chrome behind a single `isDesktop` flag. The page instantiates this
 * conditionally (`@if`) only for the row whose menu is open, so — exactly like
 * `RejectSheetComponent`/`CategoryDeleteDialogComponent` — focus restore is just "whatever was
 * focused right before this component was created" (the trigger button the admin clicked),
 * captured in `ngOnInit` and restored in `ngOnDestroy`. No trigger-element wiring needed.
 *
 * Verify/Suspend/Reactivate are shown conditionally on the row's current state (mirrors the
 * design's `u.status !== 'active'` / `u.status === 'suspended'` ternaries). Suspend is
 * additionally disabled (with a translated reason) when `canSuspend` is false — the page
 * computes that from `utils/admin-user-guards.util.ts` before it even offers this action.
 */
@Component({
  selector: 'app-admin-user-actions-panel',
  standalone: true,
  imports: [AvatarComponent, IconComponent, TranslatePipe],
  templateUrl: './admin-user-actions-panel.component.html',
  styleUrl: './admin-user-actions-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUserActionsPanelComponent implements OnInit, OnDestroy {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private previouslyFocused: HTMLElement | null = null;

  readonly user = input.required<AdminUser>();
  readonly isDesktop = input<boolean>(false);
  readonly busy = input<boolean>(false);
  readonly canSuspend = input<boolean>(true);
  readonly suspendDisabledReasonKey = input<string | null>(null);

  readonly cancel = output<void>();
  readonly verify = output<void>();
  readonly suspend = output<void>();
  readonly reactivate = output<void>();

  /** Drives the backdrop's dimming (mobile sheet dims the app behind it; the desktop popover's
   *  backdrop is an invisible click-catcher) via a `:host(.is-desktop)` CSS selector — a plain
   *  input can't be referenced from the stylesheet, and `:host { display: contents }` still
   *  supports host classes/selectors fine. */
  @HostBinding('class.is-desktop')
  protected get isDesktopHostClass(): boolean {
    return this.isDesktop();
  }

  protected readonly displayName = computed(() => {
    const u = this.user();
    return `${u.firstName} ${u.lastName}`.trim() || u.email;
  });

  protected readonly canVerify = computed(() => this.user().status !== 'Active');
  protected readonly isSuspended = computed(() => this.user().status === 'Suspended');

  constructor() {
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    });
  }

  ngOnInit(): void {
    this.previouslyFocused = document.activeElement as HTMLElement | null;
  }

  ngOnDestroy(): void {
    this.previouslyFocused?.focus?.();
  }

  protected onBackdropClick(): void {
    if (!this.busy()) this.cancel.emit();
  }

  /**
   * Suspend is only ever `[disabled]` natively for the transient `busy()` state — when it's
   * unavailable because of `canSuspend() === false` (self/Admin-row guard) the button stays
   * focusable with `aria-disabled` instead, so the reason (`suspendDisabledReasonKey`,
   * wired via `aria-describedby`) is reachable by keyboard/screen-reader users instead of
   * being dropped from the tab order entirely. This handler is the corresponding click guard,
   * since a non-natively-disabled `<button>` still activates on Enter/Space.
   */
  protected onSuspendClick(): void {
    if (this.busy() || !this.canSuspend()) return;
    this.suspend.emit();
  }

  @HostListener('keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (!this.busy()) this.cancel.emit();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusables = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
