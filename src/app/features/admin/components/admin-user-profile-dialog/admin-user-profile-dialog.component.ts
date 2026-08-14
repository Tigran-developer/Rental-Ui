import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
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
import { AdminUserStatusPillComponent } from '../admin-user-status-pill/admin-user-status-pill.component';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The design's `AdminUserProfileModal` — avatar, name + verified tick, email, status pill,
 * three stat tiles (Listings/Rentals/Flags — flags rendered in danger when > 0), an info list
 * (Role/Member since/Identity), a "View N reports" affordance when flags > 0, and the same
 * Verify/Suspend/Reactivate actions as the row menu. Renders as a centered modal on desktop
 * and a full-bleed sheet on mobile — same `isDesktop`-flag single-component idiom as
 * `CategoryDeleteDialogComponent` (see that component's doc comment) — and traps focus /
 * restores it on close the same way.
 */
@Component({
  selector: 'app-admin-user-profile-dialog',
  standalone: true,
  imports: [AdminUserStatusPillComponent, AvatarComponent, DatePipe, IconComponent, TranslatePipe],
  templateUrl: './admin-user-profile-dialog.component.html',
  styleUrl: './admin-user-profile-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUserProfileDialogComponent implements OnInit, OnDestroy {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private previouslyFocused: HTMLElement | null = null;

  readonly user = input.required<AdminUser>();
  readonly isDesktop = input<boolean>(false);
  readonly busy = input<boolean>(false);
  readonly canSuspend = input<boolean>(true);
  readonly suspendDisabledReasonKey = input<string | null>(null);

  readonly close = output<void>();
  readonly verify = output<void>();
  readonly suspend = output<void>();
  readonly reactivate = output<void>();
  readonly viewReports = output<void>();

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
    if (!this.busy()) this.close.emit();
  }

  /**
   * Suspend is only ever `[disabled]` natively for the transient `busy()` state — when it's
   * unavailable because of `canSuspend() === false` (self/Admin-row guard) the button stays
   * focusable with `aria-disabled` instead, so the reason (already wired via
   * `aria-describedby` to the visible `__reason` paragraph) is reachable by keyboard/screen-
   * reader users instead of being dropped from the tab order entirely. This handler is the
   * corresponding click guard, since a non-natively-disabled `<button>` still activates on
   * Enter/Space.
   */
  protected onSuspendClick(): void {
    if (this.busy() || !this.canSuspend()) return;
    this.suspend.emit();
  }

  @HostListener('keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (!this.busy()) this.close.emit();
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
