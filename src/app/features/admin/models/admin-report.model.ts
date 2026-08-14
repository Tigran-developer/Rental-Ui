import type {
  ReportSeverity,
  ReportStatus,
  ReportTargetType,
} from '../../reports/models/report.model';

export type { ReportSeverity, ReportStatus, ReportTargetType };

/**
 * Admin console Phase 4: the Reports & flags screen. Mirrors `AdminReportRowResponse` /
 * `AdminReportQueueResponse` / `AdminReportQueueFilter` (rental-api
 * `Application/DTOs/AdminReport*.cs`). `ReportTargetType`/`ReportSeverity`/`ReportStatus` are
 * re-exported from `features/reports/models/report.model.ts` (the Report entity's natural home
 * — see that file's header comment) rather than redefined here, same "core type lives in its
 * natural feature, admin imports it" pattern `admin-listing-queue.model.ts` uses for
 * `ToyCondition`.
 */

/**
 * One row of the admin Reports queue — also the shape returned by `GET /api/admin/reports/{id}`
 * and by each triage mutation (resolve/dismiss/reopen), always freshly recomputed after a write.
 * Mirrors `AdminReportRowResponse`. `targetImageUrl` is resolved server-side (listing primary
 * image or user avatar; null for a Message target) so the client needs no second lookup.
 */
export interface AdminReportRow {
  id: string;

  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  targetImageUrl: string | null;

  reasonCode: string;
  detail: string | null;
  severity: ReportSeverity;
  status: ReportStatus;

  createdAt: string;

  reporterId: string;
  reporterFirstName: string;
  reporterLastName: string;
  reporterEmail: string;
  reporterAvatarUrl: string | null;

  resolvedAt: string | null;
  resolutionNote: string | null;
}

/**
 * Search-filtered (not status-filtered) tab counts — same convention as
 * `AdminListingQueueCounts`/`AdminUserQueueSummary`: the header numbers stay stable as the
 * admin switches status tabs with the same search term applied. Mirrors `AdminReportCounts`.
 */
export interface AdminReportQueueCounts {
  open: number;
  resolved: number;
  dismissed: number;
  all: number;
}

/** Mirrors `AdminReportQueueResponse`. */
export interface AdminReportQueue {
  items: AdminReportRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  counts: AdminReportQueueCounts;
}

/**
 * Backend binds this to a loose string ("open" | "resolved" | "dismissed" | "all",
 * case-insensitive) — see `AdminReportQueueFilter.Status`. Unrecognised/omitted values default
 * to "open" server-side (the state that needs the admin's attention), same convention as
 * `AdminListingQueueFilter.Status` defaulting to Pending. There is no client-controlled sort
 * param: the queue's sort (severity descending, then oldest first) is fixed server-side.
 */
export type AdminReportQueueStatusFilter = 'open' | 'resolved' | 'dismissed' | 'all';

/**
 * `targetType`/`targetId` are the Users screen's `/admin/reports?userId=<id>` deep link,
 * translated by the reports-page into `targetType: 'User', targetId: userId` — see that
 * page's doc comment. Both are optional but co-dependent: the backend 400s
 * (`admin.report_target_filter_incomplete`) if `targetId` is supplied without `targetType`,
 * so callers must always supply both together or neither. `counts` in the response respects
 * this filter too.
 */
export interface AdminReportQueueParams {
  status?: AdminReportQueueStatusFilter;
  search?: string;
  targetType?: ReportTargetType;
  targetId?: string;
  page?: number;
  pageSize?: number;
}
