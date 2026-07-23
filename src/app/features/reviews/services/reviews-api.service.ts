import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import type {
  BookingReviewStatus,
  CreateOwnerReviewRequest,
  CreateRenterReviewRequest,
  CreateToyReviewRequest,
  OwnerReviewSummary,
  RenterReviewSummary,
  ToyReviewSummary,
} from '../models/review.model';

@Injectable({ providedIn: 'root' })
export class ReviewsApiService {
  private readonly http = inject(HttpClient);

  submitToy(request: CreateToyReviewRequest): Observable<BookingReviewStatus> {
    return this.http.post<BookingReviewStatus>(toApiUrl(ApiContract.reviews.submitToy), request);
  }

  submitOwner(request: CreateOwnerReviewRequest): Observable<BookingReviewStatus> {
    return this.http.post<BookingReviewStatus>(toApiUrl(ApiContract.reviews.submitOwner), request);
  }

  submitRenter(request: CreateRenterReviewRequest): Observable<BookingReviewStatus> {
    return this.http.post<BookingReviewStatus>(toApiUrl(ApiContract.reviews.submitRenter), request);
  }

  getBookingStatus(bookingId: string): Observable<BookingReviewStatus> {
    return this.http.get<BookingReviewStatus>(toApiUrl(ApiContract.reviews.bookingStatus(bookingId)));
  }

  getListingToyReviews(listingId: string): Observable<ToyReviewSummary> {
    return this.http.get<ToyReviewSummary>(toApiUrl(ApiContract.reviews.listingToyReviews(listingId)));
  }

  getOwnerReviews(userId: string): Observable<OwnerReviewSummary> {
    return this.http.get<OwnerReviewSummary>(toApiUrl(ApiContract.reviews.ownerReviews(userId)));
  }

  getRenterReviews(userId: string): Observable<RenterReviewSummary> {
    return this.http.get<RenterReviewSummary>(toApiUrl(ApiContract.reviews.renterReviews(userId)));
  }
}
