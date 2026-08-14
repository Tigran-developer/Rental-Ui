import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import type {
  AdminMarketplaceRole,
  AdminUser,
  AdminUserQueue,
  AdminUserQueueParams,
  AdminUserQueueSummary,
  AdminUserStatus,
  AdminUserSystemRole,
} from '../models/admin-user.model';

const ADMIN_USER_STATUSES = new Set<AdminUserStatus>(['Pending', 'Active', 'Suspended']);
const ADMIN_MARKETPLACE_ROLES = new Set<AdminMarketplaceRole>(['Renter', 'Owner', 'Both']);
const ADMIN_USER_SYSTEM_ROLES = new Set<AdminUserSystemRole>(['User', 'Admin']);

// Unrecognised/missing status falls back to "Pending" — the safest "needs review" state,
// same convention as AdminListingsApiService's coerceListingModerationStatus: never silently
// render an unknown wire value as something more resolved (Active) or more severe (Suspended)
// than it actually is.
function coerceAdminUserStatus(value: unknown): AdminUserStatus {
  return typeof value === 'string' && ADMIN_USER_STATUSES.has(value as AdminUserStatus)
    ? (value as AdminUserStatus)
    : 'Pending';
}

// Unrecognised/missing marketplace role falls back to "Renter" — the same default the
// backend's DeriveMarketplaceRole uses for a brand-new account with no listings/rentals.
function coerceAdminMarketplaceRole(value: unknown): AdminMarketplaceRole {
  return typeof value === 'string' && ADMIN_MARKETPLACE_ROLES.has(value as AdminMarketplaceRole)
    ? (value as AdminMarketplaceRole)
    : 'Renter';
}

// Unrecognised/missing system role falls back to "User" — the least-privileged reading, never
// grant admin-looking UI to a row whose role we couldn't parse.
function coerceAdminUserSystemRole(value: unknown): AdminUserSystemRole {
  return typeof value === 'string' && ADMIN_USER_SYSTEM_ROLES.has(value as AdminUserSystemRole)
    ? (value as AdminUserSystemRole)
    : 'User';
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

// Guards a single-user response (get-by-id / verify / suspend / reactivate) against a
// malformed or non-object payload without throwing — falls back to the id we already
// requested/acted on rather than trusting the wire to echo one back. Mirrors
// AdminListingsApiService's toDetailRecord / AdminCategoriesApiService's toCategoryRecord.
function toAdminUserRecord(
  raw: unknown,
  fallbackId: string,
): Record<string, unknown> & { id: string } {
  if (isRecordWithStringId(raw)) return raw;
  const base = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { ...base, id: fallbackId };
}

function normalizeAdminUser(raw: Record<string, unknown> & { id: string }): AdminUser {
  return {
    id: raw['id'],
    email: typeof raw['email'] === 'string' ? raw['email'] : '',
    firstName: typeof raw['firstName'] === 'string' ? raw['firstName'] : '',
    lastName: typeof raw['lastName'] === 'string' ? raw['lastName'] : '',
    avatarUrl: toNullableString(raw['avatarUrl']),
    role: coerceAdminUserSystemRole(raw['role']),
    status: coerceAdminUserStatus(raw['status']),
    isIdConfirmed: raw['isIdConfirmed'] === true,
    marketplaceRole: coerceAdminMarketplaceRole(raw['marketplaceRole']),
    listingCount: toNonNegativeInteger(raw['listingCount']),
    rentalCount: toNonNegativeInteger(raw['rentalCount']),
    flagCount: toNonNegativeInteger(raw['flagCount']),
    createdAt:
      typeof raw['createdAt'] === 'string' && raw['createdAt'].length > 0 ? raw['createdAt'] : '',
  };
}

function normalizeAdminUserArray(raw: unknown): AdminUser[] {
  const items = Array.isArray(raw) ? raw : [];
  return items.filter(isRecordWithStringId).map((item) => normalizeAdminUser(item));
}

function normalizeAdminUserQueueSummary(raw: unknown): AdminUserQueueSummary {
  const obj = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    totalUsers: toNonNegativeInteger(obj['totalUsers']),
    verifiedCount: toNonNegativeInteger(obj['verifiedCount']),
    pendingCount: toNonNegativeInteger(obj['pendingCount']),
    suspendedCount: toNonNegativeInteger(obj['suspendedCount']),
  };
}

function normalizeAdminUserQueue(raw: unknown): AdminUserQueue {
  const obj = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    items: normalizeAdminUserArray(obj['items']),
    page: toNonNegativeInteger(obj['page']),
    pageSize: toNonNegativeInteger(obj['pageSize']),
    totalCount: toNonNegativeInteger(obj['totalCount']),
    totalPages: toNonNegativeInteger(obj['totalPages']),
    summary: normalizeAdminUserQueueSummary(obj['summary']),
  };
}

function buildAdminUserQueueParams(params: AdminUserQueueParams | undefined): HttpParams {
  let httpParams = new HttpParams();
  if (!params) return httpParams;

  if (params.status) {
    httpParams = httpParams.set('status', params.status);
  }
  const search = params.search?.trim();
  if (search) {
    httpParams = httpParams.set('search', search);
  }
  if (params.sort) {
    httpParams = httpParams.set('sort', params.sort);
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
export class AdminUsersApiService {
  private readonly http = inject(HttpClient);

  getUserQueue(params?: AdminUserQueueParams): Observable<AdminUserQueue> {
    return this.http
      .get<unknown>(toApiUrl(ApiContract.adminUsers.root), {
        params: buildAdminUserQueueParams(params),
      })
      .pipe(map((raw) => normalizeAdminUserQueue(raw)));
  }

  getUserById(userId: string): Observable<AdminUser> {
    return this.http
      .get<unknown>(toApiUrl(ApiContract.adminUsers.byId(userId)))
      .pipe(map((raw) => normalizeAdminUser(toAdminUserRecord(raw, userId))));
  }

  verifyUser(userId: string): Observable<AdminUser> {
    return this.http
      .post<unknown>(toApiUrl(ApiContract.adminUsers.verify(userId)), {})
      .pipe(map((raw) => normalizeAdminUser(toAdminUserRecord(raw, userId))));
  }

  suspendUser(userId: string): Observable<AdminUser> {
    return this.http
      .post<unknown>(toApiUrl(ApiContract.adminUsers.suspend(userId)), {})
      .pipe(map((raw) => normalizeAdminUser(toAdminUserRecord(raw, userId))));
  }

  reactivateUser(userId: string): Observable<AdminUser> {
    return this.http
      .post<unknown>(toApiUrl(ApiContract.adminUsers.reactivate(userId)), {})
      .pipe(map((raw) => normalizeAdminUser(toAdminUserRecord(raw, userId))));
  }
}
