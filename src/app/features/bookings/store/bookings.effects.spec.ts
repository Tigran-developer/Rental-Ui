import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { actionsHarness, collect } from '../../../../testing/ngrx.helpers';
import { makeBookingDetail } from '../../../../testing/fixtures';
import { BookingsApiService } from '../services/bookings-api.service';
import * as BookingsActions from './bookings.actions';
import { BookingsEffects } from './bookings.effects';

type ApiStub = Partial<Record<keyof BookingsApiService, ReturnType<typeof vi.fn>>>;

/** A ProblemDetails error exactly as the API returns it (see ApiProblemDetails). */
function problemDetails(status: number, code: string, title: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: { status, type: `urn:rental:error:${code}`, title, errorCode: code },
  });
}

// Only `booking.note_too_long` is mapped to an i18n key today (see
// BOOKING_ERROR_MESSAGE_KEYS in bookings.effects.ts); everything else falls through to
// the generic ProblemDetails `title`, so the stub only needs to resolve that one key.
function translateStub(): Pick<TranslateService, 'instant'> {
  return {
    instant: ((key: string, params?: Record<string, unknown>) => {
      if (key === 'listings.booking.noteTooLongError') {
        return `Your note is too long — please keep it to ${params?.['max'] ?? ''} characters or fewer.`;
      }
      return key;
    }) as TranslateService['instant'],
  };
}

function setup(api: ApiStub) {
  const harness = actionsHarness();
  TestBed.configureTestingModule({
    providers: [
      BookingsEffects,
      harness.provider,
      { provide: BookingsApiService, useValue: api },
      { provide: TranslateService, useValue: translateStub() },
    ],
  });
  return { harness, effects: TestBed.inject(BookingsEffects) };
}

describe('BookingsEffects', () => {
  describe('createBooking$', () => {
    it('maps a successful create to createBookingSuccess', async () => {
      const booking = { id: 'new-b' } as never;
      const api = { createBooking: vi.fn().mockReturnValue(of(booking)) };
      const { harness, effects } = setup(api);

      const result = collect(effects.createBooking$);
      harness.send(BookingsActions.createBooking({ payload: { listingId: 'l1', startDate: 'a', endDate: 'b' } }));
      harness.complete();

      expect(await result).toEqual([BookingsActions.createBookingSuccess({ booking })]);
    });

    it('maps a failure to createBookingFailure with a normalized message', async () => {
      const api = { createBooking: vi.fn().mockReturnValue(throwError(() => new Error('nope'))) };
      const { harness, effects } = setup(api);

      const result = collect(effects.createBooking$);
      harness.send(BookingsActions.createBooking({ payload: { listingId: 'l1', startDate: 'a', endDate: 'b' } }));
      harness.complete();

      expect(await result).toEqual([BookingsActions.createBookingFailure({ error: 'nope' })]);
    });

    it('maps booking.note_too_long to the translated i18n message, not the raw ProblemDetails title', async () => {
      const api = {
        createBooking: vi
          .fn()
          .mockReturnValue(
            throwError(() =>
              problemDetails(400, 'booking.note_too_long', 'Note must be 280 characters or fewer.'),
            ),
          ),
      };
      const { harness, effects } = setup(api);

      const result = collect(effects.createBooking$);
      harness.send(
        BookingsActions.createBooking({
          payload: { listingId: 'l1', startDate: 'a', endDate: 'b', note: 'x'.repeat(300) },
        }),
      );
      harness.complete();

      expect(await result).toEqual([
        BookingsActions.createBookingFailure({
          error: 'Your note is too long — please keep it to 280 characters or fewer.',
        }),
      ]);
    });
  });

  it('refreshAfterCreateBookingSuccess$ reloads my bookings', async () => {
    const { harness, effects } = setup({});
    const result = collect(effects.refreshAfterCreateBookingSuccess$);
    harness.send(BookingsActions.createBookingSuccess({ booking: { id: 'x' } as never }));
    harness.complete();
    expect(await result).toEqual([BookingsActions.loadMyBookings()]);
  });

  describe('approveBookingRequest$', () => {
    it('emits success with an Approved status', async () => {
      const api = { approveBookingRequest: vi.fn().mockReturnValue(of(undefined)) };
      const { harness, effects } = setup(api);
      const result = collect(effects.approveBookingRequest$);
      harness.send(BookingsActions.approveBookingRequest({ bookingId: 'b1' }));
      harness.complete();
      expect(await result).toEqual([
        BookingsActions.approveBookingRequestSuccess({ bookingId: 'b1', status: 'Approved' }),
      ]);
    });

    it('emits failure carrying the booking id', async () => {
      const api = {
        approveBookingRequest: vi.fn().mockReturnValue(throwError(() => new Error('x'))),
      };
      const { harness, effects } = setup(api);
      const result = collect(effects.approveBookingRequest$);
      harness.send(BookingsActions.approveBookingRequest({ bookingId: 'b1' }));
      harness.complete();
      expect(await result).toEqual([
        BookingsActions.approveBookingRequestFailure({ bookingId: 'b1', error: 'x' }),
      ]);
    });
  });

  it('rejectBookingRequest$ forwards the reason and emits a Rejected status', async () => {
    const api = { rejectBookingRequest: vi.fn().mockReturnValue(of(undefined)) };
    const { harness, effects } = setup(api);
    const result = collect(effects.rejectBookingRequest$);
    harness.send(BookingsActions.rejectBookingRequest({ bookingId: 'b1', reason: 'dates_unavailable' }));
    harness.complete();
    expect(await result).toEqual([
      BookingsActions.rejectBookingRequestSuccess({ bookingId: 'b1', status: 'Rejected' }),
    ]);
    expect(api.rejectBookingRequest).toHaveBeenCalledWith('b1', 'dates_unavailable');
  });

  describe('completion handshake', () => {
    it('markActive$ maps the server detail to bookingActionSuccess', async () => {
      const detail = makeBookingDetail({ status: 'Active' });
      const api = { markActive: vi.fn().mockReturnValue(of(detail)) };
      const { harness, effects } = setup(api);
      const result = collect(effects.markActive$);
      harness.send(BookingsActions.markActive({ bookingId: 'b1' }));
      harness.complete();
      expect(await result).toEqual([BookingsActions.bookingActionSuccess({ detail })]);
    });

    it('completeBooking$ emits bookingActionFailure with the booking id on error', async () => {
      const api = { complete: vi.fn().mockReturnValue(throwError(() => new Error('boom'))) };
      const { harness, effects } = setup(api);
      const result = collect(effects.completeBooking$);
      harness.send(BookingsActions.completeBooking({ bookingId: 'b1' }));
      harness.complete();
      expect(await result).toEqual([
        BookingsActions.bookingActionFailure({ bookingId: 'b1', error: 'boom' }),
      ]);
    });

    it('reloadAfterActionFailure$ re-fetches authoritative detail after a failed action', async () => {
      const { harness, effects } = setup({});
      const result = collect(effects.reloadAfterActionFailure$);
      harness.send(BookingsActions.bookingActionFailure({ bookingId: 'b1', error: 'boom' }));
      harness.complete();
      expect(await result).toEqual([BookingsActions.loadBookingDetail({ bookingId: 'b1' })]);
    });
  });

  describe('cancelBooking$', () => {
    it('maps a successful cancel to cancelBookingSuccess', async () => {
      const api = { cancelBooking: vi.fn().mockReturnValue(of({ id: 'b1' })) };
      const { harness, effects } = setup(api);
      const result = collect(effects.cancelBooking$);
      harness.send(BookingsActions.cancelBooking({ bookingId: 'b1' }));
      harness.complete();
      expect(await result).toEqual([BookingsActions.cancelBookingSuccess({ bookingId: 'b1' })]);
    });

    it('refreshAfterCancelBooking$ reloads my bookings after a cancel', async () => {
      const { harness, effects } = setup({});
      const result = collect(effects.refreshAfterCancelBooking$);
      harness.send(BookingsActions.cancelBookingSuccess({ bookingId: 'b1' }));
      harness.complete();
      expect(await result).toEqual([BookingsActions.loadMyBookings()]);
    });
  });
});
