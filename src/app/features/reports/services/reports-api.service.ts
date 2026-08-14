import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import type {
  CreateReportRequest,
  Report,
  ReportSeverity,
  ReportStatus,
  ReportTargetType,
} from '../models/report.model';

const REPORT_TARGET_TYPES = new Set<ReportTargetType>(['Listing', 'User', 'Message']);
const REPORT_SEVERITIES = new Set<ReportSeverity>(['Low', 'Medium', 'High']);
const REPORT_STATUSES = new Set<ReportStatus>(['Open', 'Resolved', 'Dismissed']);

// Unrecognised/missing target type falls back to "Listing" — the enum's zero value
// (default(ReportTargetType) == Listing on the backend), same convention as
// AdminReportsApiService's coerceReportTargetType.
function coerceReportTargetType(value: unknown): ReportTargetType {
  return typeof value === 'string' && REPORT_TARGET_TYPES.has(value as ReportTargetType)
    ? (value as ReportTargetType)
    : 'Listing';
}

// Unrecognised/missing severity falls back to "Low" — mirrors ReportReasonCatalog.SeverityFor's
// own fallback for an unrecognised reason code, same convention as
// AdminReportsApiService's coerceReportSeverity.
function coerceReportSeverity(value: unknown): ReportSeverity {
  return typeof value === 'string' && REPORT_SEVERITIES.has(value as ReportSeverity)
    ? (value as ReportSeverity)
    : 'Low';
}

// Unrecognised/missing status falls back to "Open" — the safest "still needs attention" state,
// same convention as AdminListingsApiService's coerceListingModerationStatus.
function coerceReportStatus(value: unknown): ReportStatus {
  return typeof value === 'string' && REPORT_STATUSES.has(value as ReportStatus)
    ? (value as ReportStatus)
    : 'Open';
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeReport(raw: unknown): Report {
  const obj = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    id: typeof obj['id'] === 'string' ? obj['id'] : '',
    targetType: coerceReportTargetType(obj['targetType']),
    targetId: typeof obj['targetId'] === 'string' ? obj['targetId'] : '',
    targetLabel: typeof obj['targetLabel'] === 'string' ? obj['targetLabel'] : '',
    reasonCode: typeof obj['reasonCode'] === 'string' ? obj['reasonCode'] : '',
    detail: toNullableString(obj['detail']),
    severity: coerceReportSeverity(obj['severity']),
    status: coerceReportStatus(obj['status']),
    createdAt:
      typeof obj['createdAt'] === 'string' && obj['createdAt'].length > 0 ? obj['createdAt'] : '',
  };
}

@Injectable({ providedIn: 'root' })
export class ReportsApiService {
  private readonly http = inject(HttpClient);

  /**
   * POST /api/reports. `targetType` must be the lowercase request form
   * (`ReportTargetTypeRequest`) — see the casing-asymmetry note on `report.model.ts`.
   */
  submitReport(request: CreateReportRequest): Observable<Report> {
    return this.http
      .post<unknown>(toApiUrl(ApiContract.reports.root), request)
      .pipe(map((raw) => normalizeReport(raw)));
  }
}
