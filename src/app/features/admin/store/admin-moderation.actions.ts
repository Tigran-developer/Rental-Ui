import { createAction, props } from '@ngrx/store';

import type {
  AdminListingDetail,
  AdminListingQueue,
  AdminListingQueueStatusFilter,
} from '../models/admin-listing-queue.model';

// ── Queue (review-page tabs: Pending / Approved / Rejected) ───────────────
export const loadListingQueue = createAction('[Admin Moderation] Load Listing Queue');

export const loadListingQueueSuccess = createAction(
  '[Admin Moderation] Load Listing Queue Success',
  props<{ queue: AdminListingQueue }>(),
);

export const loadListingQueueFailure = createAction(
  '[Admin Moderation] Load Listing Queue Failure',
  props<{ error: string }>(),
);

export const setQueueStatusFilter = createAction(
  '[Admin Moderation] Set Queue Status Filter',
  props<{ status: AdminListingQueueStatusFilter }>(),
);

export const setQueuePage = createAction(
  '[Admin Moderation] Set Queue Page',
  props<{ page: number }>(),
);

// ── Approve (optimistic: reducer removes/relocates the row immediately) ───
export const approveListing = createAction(
  '[Admin Moderation] Approve Listing',
  props<{ listingId: string }>(),
);

export const approveListingSuccess = createAction(
  '[Admin Moderation] Approve Listing Success',
  props<{ listingId: string }>(),
);

export const approveListingFailure = createAction(
  '[Admin Moderation] Approve Listing Failure',
  props<{ listingId: string; error: string }>(),
);

// ── Reject with reason (optimistic) ────────────────────────────────────────
export const rejectListing = createAction(
  '[Admin Moderation] Reject Listing',
  props<{ listingId: string; reasonCode: string; note: string }>(),
);

export const rejectListingSuccess = createAction(
  '[Admin Moderation] Reject Listing Success',
  props<{ listingId: string }>(),
);

export const rejectListingFailure = createAction(
  '[Admin Moderation] Reject Listing Failure',
  props<{ listingId: string; error: string }>(),
);

// ── Recategorise (optimistic; doesn't move rows between tabs) ─────────────
export const updateListingCategory = createAction(
  '[Admin Moderation] Update Listing Category',
  props<{ listingId: string; categoryId: string; categoryName: string }>(),
);

export const updateListingCategorySuccess = createAction(
  '[Admin Moderation] Update Listing Category Success',
  props<{ listingId: string; detail: AdminListingDetail }>(),
);

export const updateListingCategoryFailure = createAction(
  '[Admin Moderation] Update Listing Category Failure',
  props<{ listingId: string; error: string }>(),
);

// ── Detail (the inspect dossier, /admin/review/:id) ────────────────────────
export const loadListingDetail = createAction(
  '[Admin Moderation] Load Listing Detail',
  props<{ listingId: string }>(),
);

export const loadListingDetailSuccess = createAction(
  '[Admin Moderation] Load Listing Detail Success',
  props<{ detail: AdminListingDetail }>(),
);

export const loadListingDetailFailure = createAction(
  '[Admin Moderation] Load Listing Detail Failure',
  props<{ error: string }>(),
);

export const clearListingDetail = createAction('[Admin Moderation] Clear Listing Detail');
