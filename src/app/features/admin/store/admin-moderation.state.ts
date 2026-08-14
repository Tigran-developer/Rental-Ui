import type {
  AdminListingDetail,
  AdminListingQueueCounts,
  AdminListingQueueStatusFilter,
  AdminListingSummary,
} from '../models/admin-listing-queue.model';

/**
 * Snapshot stashed when a mutation (approve/reject/recategorise) is
 * dispatched, so a failure can put the row — and the counts — back exactly
 * where they were. `item: null` means the row wasn't loaded locally (e.g. the
 * mutation was dispatched from the inspect page before the queue page was
 * ever visited) — in that case there's nothing to re-insert, only counts to
 * restore.
 *
 * `detailCategory` is recategorise-only: unlike approve/reject, recategorise
 * also optimistically patches `state.detail` (the inspect-page dossier), so a
 * failure must be able to restore that dossier's category independently of
 * whether the row happened to be loaded in `items` — e.g. an admin who
 * deep-linked straight to `/admin/review/:id` has `items: []` but a populated
 * `detail`. Null for approve/reject rollbacks, which never touch `detail`.
 */
export interface AdminModerationRollbackEntry {
  readonly item: AdminListingSummary | null;
  readonly index: number;
  readonly counts: AdminListingQueueCounts;
  readonly detailCategory: { categoryId: string; categoryName: string } | null;
}

export interface AdminModerationState {
  // ── Queue (review-page) ──
  readonly items: AdminListingSummary[];
  readonly statusFilter: AdminListingQueueStatusFilter;
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly totalPages: number;
  readonly counts: AdminListingQueueCounts;
  readonly isLoading: boolean;
  readonly error: string | null;
  /** Listing ids with an in-flight approve/reject/recategorise mutation. */
  readonly actionIds: string[];
  readonly rollbacks: Record<string, AdminModerationRollbackEntry>;

  // ── Detail (inspect-page) ──
  readonly detail: AdminListingDetail | null;
  readonly detailListingId: string | null;
  readonly isDetailLoading: boolean;
  readonly detailError: string | null;
}

export const initialAdminModerationState: AdminModerationState = {
  items: [],
  statusFilter: 'Pending',
  page: 1,
  pageSize: 20,
  totalCount: 0,
  totalPages: 0,
  counts: { pending: 0, approved: 0, rejected: 0 },
  isLoading: false,
  error: null,
  actionIds: [],
  rollbacks: {},

  detail: null,
  detailListingId: null,
  isDetailLoading: false,
  detailError: null,
};
