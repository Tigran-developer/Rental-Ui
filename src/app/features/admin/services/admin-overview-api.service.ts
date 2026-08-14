import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import type {
  AdminActivityFeed,
  AdminActivityFeedParams,
  AdminActivityItem,
  AdminOverview,
  ModerationAction,
  ModerationTargetType,
} from '../models/admin-overview.model';

const MODERATION_TARGET_TYPES = new Set<ModerationTargetType>([
  'Listing',
  'Category',
  'User',
  'Report',
]);

// Unrecognised/missing target type falls back to "Listing" — the enum's zero value
// (default(ModerationTargetType) == Listing on the backend). See admin-overview.model.ts for
// why ModerationAction, unlike this field, is NOT coerced to a closed set.
function coerceModerationTargetType(value: unknown): ModerationTargetType {
  return typeof value === 'string' && MODERATION_TARGET_TYPES.has(value as ModerationTargetType)
    ? (value as ModerationTargetType)
    : 'Listing';
}

// ModerationAction is a widened union (see admin-overview.model.ts) — pass any non-empty string
// through untouched rather than coercing it, and fall back to '' only for a genuinely malformed
// (non-string) value so a downstream i18n lookup has a defined, falsy key to branch on.
function toModerationAction(value: unknown): ModerationAction {
  return typeof value === 'string' ? value : '';
}

function toNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

// Distinct from toNonNegativeInteger: `averageReviewTimeMinutes` is meaningfully nullable
// (null = "nothing moderated in the trailing 30 days", not "0 minutes" = "everything moderated
// was instantaneous"). A plain `typeof === 'number'` check already keeps a real 0 as 0 while
// treating missing/null/non-numeric as null — do not fold this into toNonNegativeInteger, which
// would collapse "no data" into a misleading 0.
function toNullableFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeAdminOverview(raw: unknown): AdminOverview {
  const obj = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    awaitingReviewCount: toNonNegativeInteger(obj['awaitingReviewCount']),
    oldestAwaitingCreatedAt: toNullableString(obj['oldestAwaitingCreatedAt']),
    liveListingCount: toNonNegativeInteger(obj['liveListingCount']),
    liveListingsAddedThisWeek: toNonNegativeInteger(obj['liveListingsAddedThisWeek']),
    categoryCount: toNonNegativeInteger(obj['categoryCount']),
    visibleCategoryCount: toNonNegativeInteger(obj['visibleCategoryCount']),
    openReportCount: toNonNegativeInteger(obj['openReportCount']),
    averageReviewTimeMinutes: toNullableFiniteNumber(obj['averageReviewTimeMinutes']),
    reviewTimeTargetHours: toNonNegativeInteger(obj['reviewTimeTargetHours']),
  };
}

function isRecordWithStringId(item: unknown): item is Record<string, unknown> & { id: string } {
  return (
    item !== null &&
    typeof item === 'object' &&
    typeof (item as Record<string, unknown>)['id'] === 'string'
  );
}

function normalizeAdminActivityItem(
  raw: Record<string, unknown> & { id: string },
): AdminActivityItem {
  return {
    id: raw['id'],
    action: toModerationAction(raw['action']),
    targetType: coerceModerationTargetType(raw['targetType']),
    targetId: typeof raw['targetId'] === 'string' ? raw['targetId'] : '',
    targetLabel: typeof raw['targetLabel'] === 'string' ? raw['targetLabel'] : '',
    createdAt:
      typeof raw['createdAt'] === 'string' && raw['createdAt'].length > 0 ? raw['createdAt'] : '',

    actorId: typeof raw['actorId'] === 'string' ? raw['actorId'] : '',
    // Null when the actor user row no longer exists (deleted account) — the row itself still
    // renders, it just can't show a name/avatar. Never drop a row for this.
    actorFirstName: toNullableString(raw['actorFirstName']),
    actorLastName: toNullableString(raw['actorLastName']),
    actorAvatarUrl: toNullableString(raw['actorAvatarUrl']),

    detailJson: toNullableString(raw['detailJson']),
  };
}

function normalizeAdminActivityFeed(raw: unknown): AdminActivityFeed {
  const obj = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const items = Array.isArray(obj['items']) ? obj['items'] : [];
  return {
    items: items.filter(isRecordWithStringId).map((item) => normalizeAdminActivityItem(item)),
  };
}

function buildAdminActivityFeedParams(params: AdminActivityFeedParams | undefined): HttpParams {
  let httpParams = new HttpParams();
  if (params?.take !== undefined) {
    httpParams = httpParams.set('take', String(params.take));
  }
  return httpParams;
}

@Injectable({ providedIn: 'root' })
export class AdminOverviewApiService {
  private readonly http = inject(HttpClient);

  getOverview(): Observable<AdminOverview> {
    return this.http
      .get<unknown>(toApiUrl(ApiContract.adminOverview.root))
      .pipe(map((raw) => normalizeAdminOverview(raw)));
  }

  getActivityFeed(params?: AdminActivityFeedParams): Observable<AdminActivityFeed> {
    return this.http
      .get<unknown>(toApiUrl(ApiContract.adminOverview.activity), {
        params: buildAdminActivityFeedParams(params),
      })
      .pipe(map((raw) => normalizeAdminActivityFeed(raw)));
  }
}
