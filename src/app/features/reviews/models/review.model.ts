// Three-table review model. Scores are private — only aggregates are exposed and
// comment cards never carry a per-review score.

export interface ReviewComment {
  readonly id: string;
  readonly reviewerFirstName: string;
  readonly reviewerLastName: string;
  readonly reviewerAvatarUrl: string | null;
  readonly comment: string;
  readonly rentedDays: number;
  readonly createdAt: string;
  /** 1–5 star score — included when visible to the reader (e.g. profile pages) */
  readonly overallRating?: number | null;
  /** Title of the toy that was rented */
  readonly rentedItemTitle?: string | null;
  /** Short behavioural tag, e.g. "On time", "Returned clean", "Great comms" */
  readonly highlight?: string | null;
}

export interface ToyReviewSummary {
  readonly reviewCount: number;
  readonly hasAggregate: boolean;
  readonly overallAverage: number;
  readonly conditionAverage: number;
  readonly cleanlinessAverage: number;
  readonly valueForMoneyAverage: number;
  readonly funPlayValueAverage: number;
  readonly descriptionAccuracyAverage: number;
  readonly distribution: readonly number[];
  readonly comments: readonly ReviewComment[];
}

export interface OwnerReviewSummary {
  readonly reviewCount: number;
  readonly hasAggregate: boolean;
  readonly overallAverage: number;
  readonly communicationAverage: number;
  readonly pickupHandoverAverage: number;
  readonly friendlinessAverage: number;
  readonly distribution: readonly number[];
  readonly comments: readonly ReviewComment[];
}

// Mirrors RenterReviewSummaryResponse (rental-api DTOs/RenterReviewSummaryResponse.cs).
// NOT the same shape as OwnerReviewSummary above — renter subscores are
// communication / returned-on-time / care-of-toy / would-rent-again, distinct
// field names from the owner summary's pickup-handover / friendliness. Previously
// this endpoint's response was mistyped as OwnerReviewSummary throughout the
// store, which silently dropped the returned-on-time and care-of-toy breakdown
// values (read under field names the renter response never sends) and omitted
// would-rent-again entirely.
export interface RenterReviewSummary {
  readonly reviewCount: number;
  readonly hasAggregate: boolean;
  readonly overallAverage: number;
  readonly communicationAverage: number;
  readonly returnedOnTimeAverage: number;
  readonly careOfToyAverage: number;
  readonly wouldRentAgainAverage: number;
  readonly distribution: readonly number[];
  readonly comments: readonly ReviewComment[];
}

export type ReviewerSide = 'renter' | 'owner' | 'none';

export interface BookingReviewStatus {
  readonly bookingId: string;
  readonly role: ReviewerSide;
  readonly isCompleted: boolean;
  readonly canReviewToy: boolean;
  readonly canReviewOwner: boolean;
  readonly canReviewRenter: boolean;
  readonly hasToyReview: boolean;
  readonly hasOwnerReview: boolean;
  readonly hasRenterReview: boolean;
}

export interface CreateToyReviewRequest {
  readonly bookingId: string;
  readonly overallRating: number;
  readonly conditionRating: number;
  readonly cleanlinessRating: number;
  readonly valueForMoneyRating: number;
  readonly funPlayValueRating: number;
  readonly descriptionAccuracyRating: number;
  readonly comment?: string | null;
}

export interface CreateOwnerReviewRequest {
  readonly bookingId: string;
  readonly communicationRating: number;
  readonly pickupHandoverRating: number;
  readonly friendlinessRating: number;
  readonly comment?: string | null;
}

export interface CreateRenterReviewRequest {
  readonly bookingId: string;
  readonly communicationRating: number;
  readonly returnedOnTimeRating: number;
  readonly careOfToyRating: number;
  readonly wouldRentAgainRating: number;
  readonly comment?: string | null;
}
