import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import type {
  AdminListingDetail,
  AdminListingImage,
  AdminListingQueue,
  AdminListingQueueCounts,
  AdminListingQueueParams,
  AdminListingSummary,
  ListingModerationStatus,
  ToyCondition,
} from '../models/admin-listing-queue.model';

const TOY_CONDITIONS = new Set<ToyCondition>(['New', 'LikeNew', 'Good', 'Fair', 'Poor']);

function isToyCondition(value: unknown): value is ToyCondition {
  return typeof value === 'string' && TOY_CONDITIONS.has(value as ToyCondition);
}

const LISTING_MODERATION_STATUSES = new Set<ListingModerationStatus>([
  'Draft',
  'PendingApproval',
  'Approved',
  'Rejected',
  'Archived',
]);

// Mirrors the my-listings service's `coerceMyListingStatus` convention: an
// unrecognised/missing status falls back to the safest "needs review" state
// rather than silently rendering as something more finished than it is.
function coerceListingModerationStatus(value: unknown): ListingModerationStatus {
  return typeof value === 'string' &&
    LISTING_MODERATION_STATUSES.has(value as ListingModerationStatus)
    ? (value as ListingModerationStatus)
    : 'PendingApproval';
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function toNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeAdminListingImage(raw: unknown): AdminListingImage | null {
  if (raw === null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj['id'] !== 'string' || typeof obj['url'] !== 'string') return null;
  return {
    id: obj['id'],
    url: obj['url'],
    isPrimary: obj['isPrimary'] === true,
    sortOrder: toNonNegativeInteger(obj['sortOrder']),
  };
}

function normalizeAdminListingImages(images: unknown): AdminListingImage[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((image) => normalizeAdminListingImage(image))
    .filter((image): image is AdminListingImage => image !== null);
}

// Shared by AdminListingSummaryResponse and AdminListingDetailResponse — the
// detail DTO is a superset (adds `status` + `ownerOpenReportCount` on top of
// this exact shape), see AdminListingDetailResponse.cs.
function normalizeAdminListingSummary(
  raw: Record<string, unknown> & { id: string },
): AdminListingSummary {
  return {
    id: String(raw['id']),

    ownerId: typeof raw['ownerId'] === 'string' ? raw['ownerId'] : '',
    ownerEmail: typeof raw['ownerEmail'] === 'string' ? raw['ownerEmail'] : '',
    ownerFirstName: typeof raw['ownerFirstName'] === 'string' ? raw['ownerFirstName'] : '',
    ownerLastName: typeof raw['ownerLastName'] === 'string' ? raw['ownerLastName'] : '',

    categoryId: typeof raw['categoryId'] === 'string' ? raw['categoryId'] : '',
    categoryName: typeof raw['categoryName'] === 'string' ? raw['categoryName'] : '',

    title: typeof raw['title'] === 'string' ? raw['title'] : '',
    description: typeof raw['description'] === 'string' ? raw['description'] : '',
    pricePerDay:
      typeof raw['pricePerDay'] === 'number' && Number.isFinite(raw['pricePerDay'])
        ? raw['pricePerDay']
        : 0,
    currency: typeof raw['currency'] === 'string' ? raw['currency'] : '',
    country: typeof raw['country'] === 'string' ? raw['country'] : '',
    city: typeof raw['city'] === 'string' ? raw['city'] : '',
    addressLine: toNullableString(raw['addressLine']),

    ageFromMonths: toNullableNumber(raw['ageFromMonths']),
    ageToMonths: toNullableNumber(raw['ageToMonths']),
    condition: isToyCondition(raw['condition']) ? raw['condition'] : null,
    hygieneNotes: toNullableString(raw['hygieneNotes']),
    safetyNotes: toNullableString(raw['safetyNotes']),
    depositAmount: toNullableNumber(raw['depositAmount']),

    images: normalizeAdminListingImages(raw['images']),

    createdAt:
      typeof raw['createdAt'] === 'string' && raw['createdAt'].length > 0 ? raw['createdAt'] : '',

    photoCount: toNonNegativeInteger(raw['photoCount']),
    primaryImageUrl: toNullableString(raw['primaryImageUrl']),

    rejectionReasonCode: toNullableString(raw['rejectionReasonCode']),
    rejectionNote: toNullableString(raw['rejectionNote']),
    moderatedAt: toNullableString(raw['moderatedAt']),

    ownerAvatarUrl: toNullableString(raw['ownerAvatarUrl']),
    ownerIsIdConfirmed: raw['ownerIsIdConfirmed'] === true,
    // Nullable on the backend (decimal? — an owner with zero reviews has no
    // rating yet); keep null distinct from 0 so the UI can render "no rating"
    // rather than a misleading zero-star average.
    ownerRating: toNullableNumber(raw['ownerRating']),
    ownerReviewCount: toNonNegativeInteger(raw['ownerReviewCount']),
    ownerListingCount: toNonNegativeInteger(raw['ownerListingCount']),
    ownerCompletedRentals: toNonNegativeInteger(raw['ownerCompletedRentals']),
    ownerJoinedAt:
      typeof raw['ownerJoinedAt'] === 'string' && raw['ownerJoinedAt'].length > 0
        ? raw['ownerJoinedAt']
        : '',

    // Phase 6 "Needs category fix": both null unless PendingApproval + the keyword rule
    // disagrees with the current category. Null means "no suggestion" — keep it null, not a
    // fallback string, so the UI can tell "no suggestion" apart from "suggested category '' ".
    suggestedCategoryId: toNullableString(raw['suggestedCategoryId']),
    suggestedCategoryName: toNullableString(raw['suggestedCategoryName']),
  };
}

function normalizeAdminListingDetail(
  raw: Record<string, unknown> & { id: string },
): AdminListingDetail {
  return {
    ...normalizeAdminListingSummary(raw),
    status: coerceListingModerationStatus(raw['status']),
    // Real count as of phase 4 (`AdminListingsService.BuildDetailAsync` -> `stats?.OpenReportCount`).
    ownerOpenReportCount: toNonNegativeInteger(raw['ownerOpenReportCount']),
  };
}

function normalizeAdminListingQueueCounts(raw: unknown): AdminListingQueueCounts {
  const obj = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    pending: toNonNegativeInteger(obj['pending']),
    approved: toNonNegativeInteger(obj['approved']),
    rejected: toNonNegativeInteger(obj['rejected']),
  };
}

function isRecordWithStringId(item: unknown): item is Record<string, unknown> & { id: string } {
  return (
    item !== null &&
    typeof item === 'object' &&
    typeof (item as Record<string, unknown>)['id'] === 'string'
  );
}

// Guards a single-listing response (get-detail / update-category) against a
// malformed or non-object payload without throwing — falls back to the id we
// already requested with rather than trusting the wire to echo it back.
function toDetailRecord(
  raw: unknown,
  fallbackId: string,
): Record<string, unknown> & { id: string } {
  if (isRecordWithStringId(raw)) return raw;
  const base = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { ...base, id: fallbackId };
}

function normalizeAdminListingQueue(raw: Record<string, unknown>): AdminListingQueue {
  const items = Array.isArray(raw['items']) ? raw['items'] : [];
  return {
    items: items.filter(isRecordWithStringId).map((item) => normalizeAdminListingSummary(item)),
    page: toNonNegativeInteger(raw['page']),
    pageSize: toNonNegativeInteger(raw['pageSize']),
    totalCount: toNonNegativeInteger(raw['totalCount']),
    totalPages: toNonNegativeInteger(raw['totalPages']),
    counts: normalizeAdminListingQueueCounts(raw['counts']),
  };
}

function buildAdminListingQueueParams(params: AdminListingQueueParams | undefined): HttpParams {
  let httpParams = new HttpParams();
  if (!params) return httpParams;

  if (params.status) {
    httpParams = httpParams.set('status', params.status);
  }
  const search = params.search?.trim();
  if (search) {
    httpParams = httpParams.set('search', search);
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
export class AdminListingsApiService {
  private readonly http = inject(HttpClient);

  getListingQueue(params?: AdminListingQueueParams): Observable<AdminListingQueue> {
    return this.http
      .get<unknown>(toApiUrl(ApiContract.adminListings.queue), {
        params: buildAdminListingQueueParams(params),
      })
      .pipe(
        map((raw) =>
          normalizeAdminListingQueue(
            raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {},
          ),
        ),
      );
  }

  getListingDetail(listingId: string): Observable<AdminListingDetail> {
    return this.http
      .get<unknown>(toApiUrl(ApiContract.adminListings.detail(listingId)))
      .pipe(map((raw) => normalizeAdminListingDetail(toDetailRecord(raw, listingId))));
  }

  updateListingCategory(listingId: string, categoryId: string): Observable<AdminListingDetail> {
    return this.http
      .patch<unknown>(toApiUrl(ApiContract.adminListings.updateCategory(listingId)), {
        categoryId,
      })
      .pipe(map((raw) => normalizeAdminListingDetail(toDetailRecord(raw, listingId))));
  }

  approveListing(listingId: string): Observable<void> {
    return this.http.post<void>(toApiUrl(ApiContract.adminListings.approve(listingId)), {});
  }

  rejectListing(listingId: string, reasonCode: string, note: string): Observable<void> {
    return this.http.post<void>(toApiUrl(ApiContract.adminListings.reject(listingId)), {
      reasonCode,
      note: note.trim() || null,
    });
  }
}
