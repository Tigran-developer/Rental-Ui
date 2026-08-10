import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import type { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { makeListingDetails } from '../../../../../testing/fixtures';
import * as BookingsActions from '../../../bookings/store/bookings.actions';
import { bookingsFeatureKey } from '../../../bookings/store/bookings.reducer';
import { initialBookingsState } from '../../../bookings/store/bookings.state';
import { chatFeatureKey } from '../../../chat/store/chat.reducer';
import { initialChatState } from '../../../chat/store/chat.state';
import { publicProfilesFeatureKey } from '../../../public-profiles/store/public-profiles.reducer';
import { initialPublicProfilesState } from '../../../public-profiles/store/public-profiles.state';
import { reviewsFeatureKey } from '../../../reviews/store/reviews.reducer';
import { initialReviewsState } from '../../../reviews/store/reviews.state';
import { listingsFeatureKey } from '../../store/listings.reducer';
import { initialListingsState } from '../../store/listings.state';
import { ListingBookingPageComponent } from './listing-booking-page.component';

const LISTING_ID = 'listing-1';

/** Reaches the component's reactive form + submit handler (protected on the class). */
interface ProtectedApi {
  readonly form: {
    readonly controls: {
      readonly noteForOwner: { setValue(value: string): void };
    };
  };
  onRangeChange(event: { startDate: Date | null; endDate: Date | null }): void;
  onSubmit(): void;
}

function createFixture() {
  TestBed.configureTestingModule({
    imports: [ListingBookingPageComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      provideMockStore({
        initialState: {
          [listingsFeatureKey]: {
            ...initialListingsState,
            selectedListing: makeListingDetails({
              id: LISTING_ID,
              pricePerDay: 1000,
              depositAmount: 5000,
              owner: {
                id: 'owner-1',
                firstName: 'Owen',
                lastName: 'Owner',
                phoneNumber: null,
              },
            }),
          },
          [bookingsFeatureKey]: initialBookingsState,
          [reviewsFeatureKey]: initialReviewsState,
          [publicProfilesFeatureKey]: initialPublicProfilesState,
          [chatFeatureKey]: initialChatState,
        },
      }),
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({ id: LISTING_ID })),
        },
      },
    ],
  });

  const store = TestBed.inject(MockStore);
  const fixture = TestBed.createComponent(ListingBookingPageComponent);
  fixture.detectChanges();
  const api = fixture.componentInstance as unknown as ProtectedApi;
  return { fixture, store, api };
}

/** Finds the `createBooking` action among everything dispatched during a test. */
function findCreateBookingDispatch(dispatchSpy: {
  mock: { calls: unknown[][] };
}): ReturnType<typeof BookingsActions.createBooking> | undefined {
  return dispatchSpy.mock.calls
    .map(([action]) => action as Action)
    .find(
      (action): action is ReturnType<typeof BookingsActions.createBooking> =>
        action.type === BookingsActions.createBooking.type,
    );
}

/** Selects a 2-day range starting today so `canSubmit()` is true. */
function selectValidDateRange(api: ProtectedApi): void {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  api.onRangeChange({ startDate: start, endDate: end });
}

describe('ListingBookingPageComponent', () => {
  it('sends the trimmed note as `note` in the createBooking payload', () => {
    const { store, api } = createFixture();
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    selectValidDateRange(api);
    api.form.controls.noteForOwner.setValue('  Pick up after 6pm, please!  ');
    api.onSubmit();

    const createBookingCall = findCreateBookingDispatch(dispatchSpy);

    expect(createBookingCall).toBeDefined();
    expect(createBookingCall?.payload.note).toBe('Pick up after 6pm, please!');
    expect(createBookingCall?.payload.listingId).toBe(LISTING_ID);
  });

  it('sends `null` (not an empty string) for a whitespace-only note', () => {
    const { store, api } = createFixture();
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    selectValidDateRange(api);
    api.form.controls.noteForOwner.setValue('   \n\t  ');
    api.onSubmit();

    const createBookingCall = findCreateBookingDispatch(dispatchSpy);

    expect(createBookingCall).toBeDefined();
    expect(createBookingCall?.payload.note).toBeNull();
  });

  it('sends `null` when no note was entered at all', () => {
    const { store, api } = createFixture();
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    selectValidDateRange(api);
    api.onSubmit();

    const createBookingCall = findCreateBookingDispatch(dispatchSpy);

    expect(createBookingCall).toBeDefined();
    expect(createBookingCall?.payload.note).toBeNull();
  });
});
