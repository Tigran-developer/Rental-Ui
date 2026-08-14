import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { ReportStatus } from '../../models/admin-report.model';

export type AdminReportPillSize = 'sm' | 'md';

const LABEL_KEYS: Record<ReportStatus, string> = {
  Open: 'admin.reports.status.open',
  Resolved: 'admin.reports.status.resolved',
  Dismissed: 'admin.reports.status.dismissed',
};

/**
 * The design's `REPORT_STATUS` pill (dot + pill) — `admin-shared.jsx`: open -> the dashboard's
 * blue accent, resolved -> success, dismissed -> neutral. Visual recipe copied from
 * `admin-status-badge`. Status is never conveyed by colour alone — the dot + translated text
 * label both carry the meaning.
 */
@Component({
  selector: 'app-admin-report-status-pill',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './admin-report-status-pill.component.html',
  styleUrl: './admin-report-status-pill.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReportStatusPillComponent {
  readonly status = input.required<ReportStatus>();
  readonly size = input<AdminReportPillSize>('md');

  protected readonly labelKey = computed(() => LABEL_KEYS[this.status()]);
}
