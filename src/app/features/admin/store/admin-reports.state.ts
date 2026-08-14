import type {
  AdminReportQueueCounts,
  AdminReportQueueStatusFilter,
  AdminReportRow,
  ReportTargetType,
} from '../models/admin-report.model';

/**
 * Snapshot stashed when a triage mutation (resolve/dismiss/reopen) is dispatched, so a
 * failure can put the row back exactly where it was — same idiom as
 * `AdminUsersRollbackEntry`.
 */
export interface AdminReportsRollbackEntry {
  readonly item: AdminReportRow;
  readonly index: number;
}

/**
 * The Users screen's `/admin/reports?userId=<id>` deep link, translated into the
 * `targetType`/`targetId` pair the backend filter takes — see `reports-page.component.ts`'s
 * doc comment for where this gets set.
 */
export interface AdminReportsTargetFilter {
  readonly targetType: ReportTargetType;
  readonly targetId: string;
}

export interface AdminReportsState {
  readonly items: AdminReportRow[];
  readonly statusFilter: AdminReportQueueStatusFilter;
  readonly search: string;
  readonly targetFilter: AdminReportsTargetFilter | null;
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly totalPages: number;
  /** Respects the target filter but NOT the status tab — same convention as
   *  `AdminUsersState.summary`: the tab counts stay stable as the admin switches status tabs
   *  with the same search/target filter applied. */
  readonly counts: AdminReportQueueCounts;
  readonly isLoading: boolean;
  readonly error: string | null;
  /** Report ids with an in-flight resolve/dismiss/reopen mutation. */
  readonly actionIds: string[];
  readonly rollbacks: Record<string, AdminReportsRollbackEntry>;
}

export const initialAdminReportsState: AdminReportsState = {
  items: [],
  statusFilter: 'open',
  search: '',
  targetFilter: null,
  page: 1,
  pageSize: 20,
  totalCount: 0,
  totalPages: 0,
  counts: { open: 0, resolved: 0, dismissed: 0, all: 0 },
  isLoading: false,
  error: null,
  actionIds: [],
  rollbacks: {},
};
