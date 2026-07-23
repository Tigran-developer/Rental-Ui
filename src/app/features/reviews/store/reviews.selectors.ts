import { createFeatureSelector, createSelector } from '@ngrx/store';

import type { OwnerReviewSummary, RenterReviewSummary, ToyReviewSummary } from '../models/review.model';
import { reviewsFeatureKey } from './reviews.reducer';
import type { AsyncEntry, ReviewsState } from './reviews.state';

export const selectReviewsState = createFeatureSelector<ReviewsState>(reviewsFeatureKey);

function emptyEntry<T>(): AsyncEntry<T> {
  return { data: null, isLoading: false, error: null };
}

// ── Listing toy reviews ────────────────────────────────────────────────────────
const selectListingToyEntry = (listingId: string) =>
  createSelector(
    selectReviewsState,
    (s): AsyncEntry<ToyReviewSummary> => s.listingToyReviews[listingId] ?? emptyEntry(),
  );

export const selectListingToyReviews = (listingId: string) =>
  createSelector(selectListingToyEntry(listingId), (e): ToyReviewSummary | null => e.data);

export const selectListingToyReviewsLoading = (listingId: string) =>
  createSelector(selectListingToyEntry(listingId), (e): boolean => e.isLoading);

export const selectListingToyReviewsError = (listingId: string) =>
  createSelector(selectListingToyEntry(listingId), (e): string | null => e.error);

// ── Owner reviews ───────────────────────────────────────────────────────────────
const selectOwnerEntry = (userId: string) =>
  createSelector(
    selectReviewsState,
    (s): AsyncEntry<OwnerReviewSummary> => s.ownerReviews[userId] ?? emptyEntry(),
  );

export const selectOwnerReviews = (userId: string) =>
  createSelector(selectOwnerEntry(userId), (e): OwnerReviewSummary | null => e.data);

export const selectOwnerReviewsLoading = (userId: string) =>
  createSelector(selectOwnerEntry(userId), (e): boolean => e.isLoading);

export const selectOwnerReviewsError = (userId: string) =>
  createSelector(selectOwnerEntry(userId), (e): string | null => e.error);

// ── Renter reviews ──────────────────────────────────────────────────────────────
const selectRenterEntry = (userId: string) =>
  createSelector(
    selectReviewsState,
    (s): AsyncEntry<RenterReviewSummary> => s.renterReviews[userId] ?? emptyEntry(),
  );

export const selectRenterReviews = (userId: string) =>
  createSelector(selectRenterEntry(userId), (e): RenterReviewSummary | null => e.data);

export const selectRenterReviewsLoading = (userId: string) =>
  createSelector(selectRenterEntry(userId), (e): boolean => e.isLoading);

export const selectRenterReviewsError = (userId: string) =>
  createSelector(selectRenterEntry(userId), (e): string | null => e.error);
