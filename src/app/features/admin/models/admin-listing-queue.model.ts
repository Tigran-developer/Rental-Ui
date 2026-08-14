import type { ToyCondition } from '../../listings/models/listing-details.model';

export type { ToyCondition };

/**
 * Mirrors the backend `ListingStatus` enum (Domain/Enums/ListingStatus.cs),
 * serialized as a string by the global `JsonStringEnumConverter`. Used only on
 * `AdminListingDetail.status` — the queue itself is filtered by the narrower
 * `AdminListingQueueStatusFilter` (Draft/Archived aren't queue states).
 */
export type ListingModerationStatus =
  | 'Draft'
  | 'PendingApproval'
  | 'Approved'
  | 'Rejected'
  | 'Archived';

/** Mirrors `ListingImageResponse` (rental-api). */
export interface AdminListingImage {
  id: string;
  url: string;
  isPrimary: boolean;
  sortOrder: number;
}

/**
 * One row of the admin moderation queue. Mirrors `AdminListingSummaryResponse`
 * (rental-api `Application/DTOs/AdminListingSummaryResponse.cs`) — a superset
 * of the legacy `PendingListing` shape, plus photo/rejection/moderation
 * metadata and an owner-trust block.
 */
export interface AdminListingSummary {
  id: string;

  ownerId: string;
  ownerEmail: string;
  ownerFirstName: string;
  ownerLastName: string;

  categoryId: string;
  categoryName: string;

  title: string;
  description: string;
  pricePerDay: number;
  currency: string;
  country: string;
  city: string;
  addressLine: string | null;

  ageFromMonths: number | null;
  ageToMonths: number | null;
  condition: ToyCondition | null;
  hygieneNotes: string | null;
  safetyNotes: string | null;
  depositAmount: number | null;

  images: AdminListingImage[];

  createdAt: string;

  photoCount: number;
  primaryImageUrl: string | null;

  rejectionReasonCode: string | null;
  rejectionNote: string | null;
  moderatedAt: string | null;

  // Owner trust block — computed with grouped queries on the backend, not
  // per-row lookups (see AdminListingsStore).
  ownerAvatarUrl: string | null;
  ownerIsIdConfirmed: boolean;
  ownerRating: number | null;
  ownerReviewCount: number;
  ownerListingCount: number;
  ownerCompletedRentals: number;
  ownerJoinedAt: string;

  /**
   * Admin console Phase 6 ("Needs category fix"): both null unless the listing is
   * PendingApproval and the keyword rule's best-scoring category differs from `categoryId` —
   * see `AdminListingsService`'s suggestion rule on the backend for the exact scoring. Purely
   * additive on `AdminListingSummaryResponse`/`AdminListingDetailResponse`.
   */
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
}

/**
 * The single-listing "inspect" dossier. Mirrors `AdminListingDetailResponse` —
 * everything `AdminListingSummary` has, plus the listing's current moderation
 * status and the owner's open-report count.
 *
 * `ownerOpenReportCount` is a phase-4 placeholder on the backend (the Report
 * entity doesn't exist yet) — it is always 0 today.
 */
export interface AdminListingDetail extends AdminListingSummary {
  status: ListingModerationStatus;
  ownerOpenReportCount: number;
}

export interface AdminListingQueueCounts {
  pending: number;
  approved: number;
  rejected: number;
}

/** Mirrors `AdminListingQueueResponse`. */
export interface AdminListingQueue {
  items: AdminListingSummary[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  /**
   * Filtered by `search` but NOT by `status` — these are the counts the tab
   * badges should show regardless of which tab is currently selected, so
   * switching tabs with a search term applied doesn't make the badges lie.
   */
  counts: AdminListingQueueCounts;
}

/**
 * Backend binds this to a loose string ("Pending" | "Approved" | "Rejected",
 * case-insensitive) rather than the ListingStatus enum — see
 * `AdminListingQueueFilter`. Draft/Archived are intentionally not queue
 * states.
 */
export type AdminListingQueueStatusFilter = 'Pending' | 'Approved' | 'Rejected';

export interface AdminListingQueueParams {
  status?: AdminListingQueueStatusFilter;
  search?: string;
  page?: number;
  pageSize?: number;
}
