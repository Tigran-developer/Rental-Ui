import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { IconComponent } from '../../../../shared/ui/icon/icon.component';

/**
 * The design's `CheckPill`: a check/x icon + label, tinted success/danger.
 * Used for pass/fail style checklist rows (e.g. listing inspection —
 * Phase 1).
 */
@Component({
  selector: 'app-check-pill',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './check-pill.component.html',
  styleUrl: './check-pill.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckPillComponent {
  readonly ok = input.required<boolean>();
  readonly label = input.required<string>();
}
