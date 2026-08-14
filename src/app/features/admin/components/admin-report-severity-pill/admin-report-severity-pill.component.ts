import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import type { ReportSeverity } from '../../models/admin-report.model';

export type AdminReportPillSize = 'sm' | 'md';

const LABEL_KEYS: Record<ReportSeverity, string> = {
  Low: 'admin.reports.severity.low',
  Medium: 'admin.reports.severity.medium',
  High: 'admin.reports.severity.high',
};

/**
 * The design's `REPORT_SEV` pill (dot + pill) — `admin-shared.jsx`: high -> danger,
 * medium -> warn, low -> neutral. Visual recipe copied from `admin-status-badge`. Severity is
 * never conveyed by colour alone: the dot + translated text label both carry the meaning.
 */
@Component({
  selector: 'app-admin-report-severity-pill',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './admin-report-severity-pill.component.html',
  styleUrl: './admin-report-severity-pill.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReportSeverityPillComponent {
  readonly severity = input.required<ReportSeverity>();
  readonly size = input<AdminReportPillSize>('md');

  protected readonly labelKey = computed(() => LABEL_KEYS[this.severity()]);
}
