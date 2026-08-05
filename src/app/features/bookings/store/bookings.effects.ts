import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { TranslateService } from '@ngx-translate/core';
import { catchError, concatMap, map, of, switchMap } from 'rxjs';

import { type ApiErrorCode, getApiErrorCode } from '../../../api/api-error.model';
import { toApiErrorMessage } from '../../../api/http-error-message.util';
import { BookingsApiService } from '../services/bookings-api.service';
import * as BookingsActions from './bookings.actions';

/**
 * Server ServiceError codes → i18n keys, for the (currently few) booking.* codes whose
 * backend `title` isn't a fit for direct display. Unmapped codes fall through to the
 * generic ProblemDetails `title` via `toApiErrorMessage` — see `ChatEffects` for the
 * pattern this mirrors.
 */
const BOOKING_ERROR_MESSAGE_KEYS: Readonly<Partial<Record<ApiErrorCode, string>>> = {
  'booking.note_too_long': 'listings.booking.noteTooLongError',
};

@Injectable()
export class BookingsEffects {
  private readonly actions$ = inject(Actions);
  private readonly bookingsApi = inject(BookingsApiService);
  private readonly translate = inject(TranslateService);

  private toErrorMessage(error: unknown): string {
    const key = BOOKING_ERROR_MESSAGE_KEYS[getApiErrorCode(error) ?? ''];
    if (key === undefined) {
      return toApiErrorMessage(error);
    }
    return this.translate.instant(key, { max: 280 });
  }

  readonly createBooking$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BookingsActions.createBooking),
      concatMap(({ payload }) =>
        this.bookingsApi.createBooking(payload).pipe(
          map((booking) => BookingsActions.createBookingSuccess({ booking })),
          catchError((error: unknown) =>
            of(
              BookingsActions.createBookingFailure({
                error: this.toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly refreshAfterCreateBookingSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BookingsActions.createBookingSuccess),
      map(() => BookingsActions.loadMyBookings()),
    ),
  );

  readonly loadMyBookings$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BookingsActions.loadMyBookings),
      switchMap(() =>
        this.bookingsApi.getMyBookings().pipe(
          map((bookings) => BookingsActions.loadMyBookingsSuccess({ bookings })),
          catchError((error: unknown) =>
            of(
              BookingsActions.loadMyBookingsFailure({
                error: this.toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly loadBookingRequests$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BookingsActions.loadBookingRequests),
      switchMap(() =>
        this.bookingsApi.getBookingRequests().pipe(
          map((requests) =>
            BookingsActions.loadBookingRequestsSuccess({ requests }),
          ),
          catchError((error: unknown) =>
            of(
              BookingsActions.loadBookingRequestsFailure({
                error: this.toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly approveBookingRequest$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BookingsActions.approveBookingRequest),
      concatMap(({ bookingId }) =>
        this.bookingsApi.approveBookingRequest(bookingId).pipe(
          map(() =>
            BookingsActions.approveBookingRequestSuccess({
              bookingId,
              status: 'Approved',
            }),
          ),
          catchError((error: unknown) =>
            of(
              BookingsActions.approveBookingRequestFailure({
                bookingId,
                error: this.toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly rejectBookingRequest$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BookingsActions.rejectBookingRequest),
      concatMap(({ bookingId, reason }) =>
        this.bookingsApi.rejectBookingRequest(bookingId, reason).pipe(
          map(() =>
            BookingsActions.rejectBookingRequestSuccess({
              bookingId,
              status: 'Rejected',
            }),
          ),
          catchError((error: unknown) =>
            of(
              BookingsActions.rejectBookingRequestFailure({
                bookingId,
                error: this.toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly loadBookingDetail$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BookingsActions.loadBookingDetail),
      switchMap(({ bookingId }) =>
        this.bookingsApi.getBookingById(bookingId).pipe(
          map((detail) => BookingsActions.loadBookingDetailSuccess({ detail })),
          catchError((error: unknown) =>
            of(
              BookingsActions.loadBookingDetailFailure({
                error: this.toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly markActive$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BookingsActions.markActive),
      concatMap(({ bookingId }) =>
        this.bookingsApi.markActive(bookingId).pipe(
          map((detail) => BookingsActions.bookingActionSuccess({ detail })),
          catchError((error: unknown) =>
            of(
              BookingsActions.bookingActionFailure({
                bookingId,
                error: this.toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly completeBooking$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BookingsActions.completeBooking),
      concatMap(({ bookingId }) =>
        this.bookingsApi.complete(bookingId).pipe(
          map((detail) => BookingsActions.bookingActionSuccess({ detail })),
          catchError((error: unknown) =>
            of(
              BookingsActions.bookingActionFailure({
                bookingId,
                error: this.toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  // A failed action reloads authoritative state from the server.
  readonly reloadAfterActionFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BookingsActions.bookingActionFailure),
      map(({ bookingId }) => BookingsActions.loadBookingDetail({ bookingId })),
    ),
  );

  readonly cancelBooking$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BookingsActions.cancelBooking),
      concatMap(({ bookingId }) =>
        this.bookingsApi.cancelBooking(bookingId).pipe(
          map(() => BookingsActions.cancelBookingSuccess({ bookingId })),
          catchError((error: unknown) =>
            of(
              BookingsActions.cancelBookingFailure({
                error: this.toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly refreshAfterCancelBooking$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BookingsActions.cancelBookingSuccess),
      map(() => BookingsActions.loadMyBookings()),
    ),
  );
}
