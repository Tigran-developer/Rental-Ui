import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { AdminUserStatus } from '../../models/admin-user.model';

export type AdminUserStatusPillSize = 'sm' | 'md';

const LABEL_KEYS: Record<AdminUserStatus, string> = {
  Active: 'admin.users.status.active',
  Pending: 'admin.users.status.pending',
  Suspended: 'admin.users.status.suspended',
};

/**
 * The design's user-account status pill (`USER_STATUS` in `admin-shared.jsx`) — a dot + pill,
 * same visual recipe as `AdminStatusBadgeComponent` but keyed to `AdminUserStatus`
 * (Active/Pending/Suspended) instead of that component's listing-moderation variants, which
 * don't overlap with this axis (see `admin-user.model.ts`'s doc comment on the two roles not
 * being the same thing — same care applies to the two status vocabularies).
 */
@Component({
  selector: 'app-admin-user-status-pill',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './admin-user-status-pill.component.html',
  styleUrl: './admin-user-status-pill.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUserStatusPillComponent {
  readonly status = input.required<AdminUserStatus>();
  readonly size = input<AdminUserStatusPillSize>('md');

  protected readonly labelKey = computed(() => LABEL_KEYS[this.status()]);
}
