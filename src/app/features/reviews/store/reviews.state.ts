import type { OwnerReviewSummary, RenterReviewSummary, ToyReviewSummary } from '../models/review.model';

export interface AsyncEntry<T> {
  readonly data: T | null;
  readonly isLoading: boolean;
  readonly error: string | null;
}

export interface ReviewsState {
  readonly listingToyReviews: Readonly<Record<string, AsyncEntry<ToyReviewSummary>>>;
  readonly ownerReviews: Readonly<Record<string, AsyncEntry<OwnerReviewSummary>>>;
  readonly renterReviews: Readonly<Record<string, AsyncEntry<RenterReviewSummary>>>;
}

export const initialReviewsState: ReviewsState = {
  listingToyReviews: {},
  ownerReviews: {},
  renterReviews: {},
};
