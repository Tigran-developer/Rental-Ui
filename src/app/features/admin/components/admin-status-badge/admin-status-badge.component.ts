import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

export type AdminStatusBadgeVariant = 'pending' | 'approved' | 'rejected' | 'flag';
export type AdminStatusBadgeSize = 'sm' | 'md';

const LABEL_KEYS: Record<AdminStatusBadgeVariant, string> = {
  pending: 'admin.console.statusBadge.pending',
  approved: 'admin.console.statusBadge.approved',
  rejected: 'admin.console.statusBadge.rejected',
  flag: 'admin.console.statusBadge.flag',
};

/**
 * The design's `AdminStatusBadge`: a dot + pill. Visual recipe copied from
 * `shared/ui/status-badge` (dot+pill shape, 3px/10px padding), but built as
 * a separate component because that one is typed to a fixed English
 * `DashStatus` union and isn't translatable — see CLAUDE.md task note.
 */
@Component({
  selector: 'app-admin-status-badge',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './admin-status-badge.component.html',
  styleUrl: './admin-status-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminStatusBadgeComponent {
  readonly variant = input.required<AdminStatusBadgeVariant>();
  readonly size = input<AdminStatusBadgeSize>('md');

  protected readonly labelKey = computed(() => LABEL_KEYS[this.variant()]);
}
