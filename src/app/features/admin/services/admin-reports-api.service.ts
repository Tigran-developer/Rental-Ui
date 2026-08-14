import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import type {
  AdminReportQueue,
  AdminReportQueueCounts,
  AdminReportQueueParams,
  AdminReportRow,
  ReportSeverity,
  ReportStatus,
  ReportTargetType,
} from '../models/admin-report.model';

const REPORT_TARGET_TYPES = new Set<ReportTargetType>(['Listing', 'User', 'Message']);
const REPORT_SEVERITIES = new Set<ReportSeverity>(['Low', 'Medium', 'High']);
const REPORT_STATUSES = new Set<ReportStatus>(['Open', 'Resolved', 'Dismissed']);

// Unrecognised/missing target type falls back to "Listing" — the enum's zero value
// (default(ReportTargetType) == Listing on the backend).
function coerceReportTargetType(value: unknown): ReportTargetType {
  return typeof value === 'string' && REPORT_TARGET_TYPES.has(value as ReportTargetType)
    ? (value as ReportTargetType)
    : 'Listing';
}

// Unrecognised/missing severity falls back to "Low" — mirrors ReportReasonCatalog.SeverityFor's
// own fallback for an unrecognised reason code on the backend.
function coerceReportSeverity(value: unknown): ReportSeverity {
  return typeof value === 'string' && REPORT_SEVERITIES.has(value as ReportSeverity)
    ? (value as ReportSeverity)
    : 'Low';
}

// Unrecognised/missing status falls back to "Open" — the safest "still needs attention" state,
// same convention as AdminListingsApiService's coerceListingModerationStatus: never silently
// render an unknown wire value as more resolved than it actually is.
function coerceReportStatus(value: unknown): ReportStatus {
  return typeof value === 'string' && REPORT_STATUSES.has(value as ReportStatus)
    ? (value as ReportStatus)
    : 'Open';
}

function toNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecordWithStringId(item: unknown): item is Record<string, unknown> & { id: string } {
  return (
    item !== null &&
    typeof item === 'object' &&
    typeof (item as Record<string, unknown>)['id'] === 'string'
  );
}

// Guards a single-report response (get-by-id / resolve / dismiss / reopen) against a malformed
// or non-object payload without throwing — falls back to the id we already requested/acted on
// rather than trusting the wire to echo one back. Mirrors AdminListingsApiService's
// toDetailRecord / AdminUsersApiService's toAdminUserRecord.
function toAdminReportRecord(
  raw: unknown,
  fallbackId: string,
): Record<string, unknown> & { id: string } {
  if (isRecordWithStringId(raw)) return raw;
  const base = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { ...base, id: fallbackId };
}

function normalizeAdminReportRow(raw: Record<string, unknown> & { id: string }): AdminReportRow {
  return {
    id: raw['id'],

    targetType: coerceReportTargetType(raw['targetType']),
    targetId: typeof raw['targetId'] === 'string' ? raw['targetId'] : '',
    targetLabel: typeof raw['targetLabel'] === 'string' ? raw['targetLabel'] : '',
    // Null for a Message target, or when a listing/user's image/avatar isn't set — keep
    // distinct from an empty string so the UI can fall back to a placeholder cleanly.
    targetImageUrl: toNullableString(raw['targetImageUrl']),

    reasonCode: typeof raw['reasonCode'] === 'string' ? raw['reasonCode'] : '',
    detail: toNullableString(raw['detail']),
    severity: coerceReportSeverity(raw['severity']),
    status: coerceReportStatus(raw['status']),

    createdAt:
      typeof raw['createdAt'] === 'string' && raw['createdAt'].length > 0 ? raw['createdAt'] : '',

    reporterId: typeof raw['reporterId'] === 'string' ? raw['reporterId'] : '',
    reporterFirstName: typeof raw['reporterFirstName'] === 'string' ? raw['reporterFirstName'] : '',
    reporterLastName: typeof raw['reporterLastName'] === 'string' ? raw['reporterLastName'] : '',
    reporterEmail: typeof raw['reporterEmail'] === 'string' ? raw['reporterEmail'] : '',
    reporterAvatarUrl: toNullableString(raw['reporterAvatarUrl']),

    resolvedAt: toNullableString(raw['resolvedAt']),
    resolutionNote: toNullableString(raw['resolutionNote']),
  };
}

function normalizeAdminReportQueueCounts(raw: unknown): AdminReportQueueCounts {
  const obj = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    open: toNonNegativeInteger(obj['open']),
    resolved: toNonNegativeInteger(obj['resolved']),
    dismissed: toNonNegativeInteger(obj['dismissed']),
    all: toNonNegativeInteger(obj['all']),
  };
}

function normalizeAdminReportQueue(raw: unknown): AdminReportQueue {
  const obj = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const items = Array.isArray(obj['items']) ? obj['items'] : [];
  return {
    items: items.filter(isRecordWithStringId).map((item) => normalizeAdminReportRow(item)),
    page: toNonNegativeInteger(obj['page']),
    pageSize: toNonNegativeInteger(obj['pageSize']),
    totalCount: toNonNegativeInteger(obj['totalCount']),
    totalPages: toNonNegativeInteger(obj['totalPages']),
    counts: normalizeAdminReportQueueCounts(obj['counts']),
  };
}

function buildAdminReportQueueParams(params: AdminReportQueueParams | undefined): HttpParams {
  let httpParams = new HttpParams();
  if (!params) return httpParams;

  if (params.status) {
    httpParams = httpParams.set('status', params.status);
  }
  const search = params.search?.trim();
  if (search) {
    httpParams = httpParams.set('search', search);
  }
  if (params.targetType) {
    httpParams = httpParams.set('targetType', params.targetType);
  }
  if (params.targetId) {
    httpParams = httpParams.set('targetId', params.targetId);
  }
  if (params.page !== undefined) {
    httpParams = httpParams.set('page', String(params.page));
  }
  if (params.pageSize !== undefined) {
    httpParams = httpParams.set('pageSize', String(params.pageSize));
  }
  return httpParams;
}

@Injectable({ providedIn: 'root' })
export class AdminReportsApiService {
  private readonly http = inject(HttpClient);

  getReportQueue(params?: AdminReportQueueParams): Observable<AdminReportQueue> {
    return this.http
      .get<unknown>(toApiUrl(ApiContract.adminReports.root), {
        params: buildAdminReportQueueParams(params),
      })
      .pipe(map((raw) => normalizeAdminReportQueue(raw)));
  }

  getReportById(reportId: string): Observable<AdminReportRow> {
    return this.http
      .get<unknown>(toApiUrl(ApiContract.adminReports.byId(reportId)))
      .pipe(map((raw) => normalizeAdminReportRow(toAdminReportRecord(raw, reportId))));
  }

  resolveReport(reportId: string, note?: string): Observable<AdminReportRow> {
    return this.http
      .post<unknown>(toApiUrl(ApiContract.adminReports.resolve(reportId)), {
        note: note?.trim() || null,
      })
      .pipe(map((raw) => normalizeAdminReportRow(toAdminReportRecord(raw, reportId))));
  }

  dismissReport(reportId: string, note?: string): Observable<AdminReportRow> {
    return this.http
      .post<unknown>(toApiUrl(ApiContract.adminReports.dismiss(reportId)), {
        note: note?.trim() || null,
      })
      .pipe(map((raw) => normalizeAdminReportRow(toAdminReportRecord(raw, reportId))));
  }

  reopenReport(reportId: string): Observable<AdminReportRow> {
    return this.http
      .post<unknown>(toApiUrl(ApiContract.adminReports.reopen(reportId)), {})
      .pipe(map((raw) => normalizeAdminReportRow(toAdminReportRecord(raw, reportId))));
  }
}
