import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { IconComponent } from '../../../../shared/ui/icon/icon.component';

export type AdminStatCardTone = 'success' | 'warn' | 'danger' | 'neutral';

/**
 * Stat tile used by Overview/Categories/Users: a big number, a label, an
 * optional tinted sub-line, and an optional icon tile. `value` accepts
 * `null` for the loading-skeleton state (Phase 0 has no live data source
 * for these yet — see admin-shell.component.ts).
 */
@Component({
  selector: 'app-admin-stat-card',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './admin-stat-card.component.html',
  styleUrl: './admin-stat-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminStatCardComponent {
  readonly value = input<number | string | null>(null);
  readonly label = input.required<string>();
  readonly subLabel = input<string | null>(null);
  readonly subTone = input<AdminStatCardTone>('neutral');
  readonly icon = input<string | null>(null);
}
