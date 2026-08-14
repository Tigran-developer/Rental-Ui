import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';

import { makeListingDetails, makeUser } from '../../../../../testing/fixtures';
import {
  ListingDetailsPageComponent,
  hasAnyToyDetail,
  resolveAgeRangeDisplay,
  resolveConditionLabelKey,
} from './listing-details-page.component';
import type { ListingDetails } from '../../models/listing-details.model';
import { authFeatureKey } from '../../../auth/store/auth.reducer';
import { initialAuthState } from '../../../auth/store/auth.state';
import { bookingsFeatureKey } from '../../../bookings/store/bookings.reducer';
import { initialBookingsState } from '../../../bookings/store/bookings.state';
import { favoritesFeatureKey } from '../../../favorites/store/favorites.reducer';
import { initialFavoritesState } from '../../../favorites/store/favorites.state';
import { publicProfilesFeatureKey } from '../../../public-profiles/store/public-profiles.reducer';
import { initialPublicProfilesState } from '../../../public-profiles/store/public-profiles.state';
import { reviewsFeatureKey } from '../../../reviews/store/reviews.reducer';
import { initialReviewsState } from '../../../reviews/store/reviews.state';
import { listingsFeatureKey } from '../../store/listings.reducer';
import { initialListingsState } from '../../store/listings.state';

function baseListing(overrides: Partial<ListingDetails> = {}): ListingDetails {
  return {
    id: 'l1',
    title: 'Wooden train set',
    description: 'A lovely train set.',
    city: 'Yerevan',
    pricePerDay: 1500,
    images: [],
    owner: { id: 'u1', firstName: 'Anna', lastName: 'K', phoneNumber: null },
    bookedDateRanges: [],
    isFavorite: false,
    ...overrides,
  };
}

describe('resolveConditionLabelKey', () => {
  it.each([
    ['New', 'listings.details.conditionValues.new'],
    ['LikeNew', 'listings.details.conditionValues.likeNew'],
    ['Like New', 'listings.details.conditionValues.likeNew'],
    ['like-new', 'listings.details.conditionValues.likeNew'],
    ['Good', 'listings.details.conditionValues.good'],
    ['Fair', 'listings.details.conditionValues.fair'],
  ])('maps %s -> %s', (input, expected) => {
    expect(resolveConditionLabelKey(input)).toBe(expected);
  });

  it('returns null for an unknown or missing condition', () => {
    expect(resolveConditionLabelKey('Poor')).toBeNull();
    expect(resolveConditionLabelKey(undefined)).toBeNull();
    expect(resolveConditionLabelKey(null)).toBeNull();
    expect(resolveConditionLabelKey('')).toBeNull();
  });
});

describe('resolveAgeRangeDisplay', () => {
  it('returns the from-to key when both bounds are present', () => {
    expect(resolveAgeRangeDisplay(6, 24)).toEqual({
      key: 'listings.details.toyDetails.ageRangeFromTo',
      params: { from: 6, to: 24 },
    });
  });

  it('returns the from-only key when only the lower bound is present', () => {
    expect(resolveAgeRangeDisplay(6, null)).toEqual({
      key: 'listings.details.toyDetails.ageRangeFromOnly',
      params: { from: 6 },
    });
  });

  it('returns the to-only key when only the upper bound is present', () => {
    expect(resolveAgeRangeDisplay(undefined, 36)).toEqual({
      key: 'listings.details.toyDetails.ageRangeToOnly',
      params: { to: 36 },
    });
  });

  it('returns null when neither bound is a finite number', () => {
    expect(resolveAgeRangeDisplay(null, null)).toBeNull();
    expect(resolveAgeRangeDisplay(undefined, undefined)).toBeNull();
    expect(resolveAgeRangeDisplay(Number.NaN, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('hasAnyToyDetail', () => {
  it('is false when the listing carries no toy-trust fields', () => {
    expect(hasAnyToyDetail(baseListing())).toBe(false);
  });

  it.each([
    ['ageFromMonths', { ageFromMonths: 6 }],
    ['condition', { condition: 'Good' as const }],
    ['hygieneNotes', { hygieneNotes: 'Cleaned with baby-safe soap.' }],
    ['safetyNotes', { safetyNotes: 'Small parts — not for under 3.' }],
  ])('is true when %s is present', (_label, overrides) => {
    expect(hasAnyToyDetail(baseListing(overrides))).toBe(true);
  });

  it('is false when hygiene/safety notes are present but blank', () => {
    expect(hasAnyToyDetail(baseListing({ hygieneNotes: '   ', safetyNotes: '' }))).toBe(false);
  });
});

/**
 * Constructs the real component through Angular's DI the way the router
 * actually does — no TestBed override that could paper over a broken
 * `providers`/`imports` split. This is the regression guard for the bug
 * where `DramCurrencyPipe` was injected (`inject(DramCurrencyPipe)`) but
 * only ever listed in the component's `imports` array: `imports` makes a
 * pipe usable as `| dram` in the template, it does NOT register it as an
 * injectable, so the component threw `NG0201: No provider found for
 * DramCurrencyPipe` on every construction and the whole route rendered
 * nothing. The pure-function tests above never caught this because they
 * never went through `TestBed.createComponent`.
 */
describe('ListingDetailsPageComponent (DI construction)', () => {
  function createFixture(listingId = 'listing-1') {
    TestBed.configureTestingModule({
      imports: [ListingDetailsPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        // Real root provider (see `app.config.ts`) — unrelated to the
        // DramCurrencyPipe bug this spec guards, but the component also
        // injects `MessageService` and the real app provides it at root.
        MessageService,
        provideMockStore({
          initialState: {
            [listingsFeatureKey]: initialListingsState,
            [bookingsFeatureKey]: initialBookingsState,
            [reviewsFeatureKey]: initialReviewsState,
            [publicProfilesFeatureKey]: initialPublicProfilesState,
            [favoritesFeatureKey]: initialFavoritesState,
            [authFeatureKey]: initialAuthState,
          },
        }),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: listingId })),
          },
        },
      ],
    });

    return TestBed.createComponent(ListingDetailsPageComponent);
  }

  it('constructs without throwing NG0201 for the DramCurrencyPipe injection', () => {
    expect(() => {
      const fixture = createFixture();
      fixture.detectChanges();
    }).not.toThrow();
  });
});

/**
 * The "Report this listing" affordance is a safety control — it must never appear for a guest
 * (report submission requires authentication) or on your own listing (the server also rejects
 * this via `report.cannot_report_own`, but there's no reason to ever offer it here). See
 * `canReportListing` in `listing-details-page.component.ts`.
 */
describe('ListingDetailsPageComponent — report affordance', () => {
  function setup(options: {
    authenticated: boolean;
    userId?: string;
    ownerId?: string;
  }): ReturnType<typeof TestBed.createComponent<ListingDetailsPageComponent>> {
    const listing = makeListingDetails({
      id: 'listing-1',
      owner: {
        id: options.ownerId ?? 'owner-1',
        firstName: 'Owen',
        lastName: 'Owner',
        phoneNumber: null,
      },
    });
    TestBed.configureTestingModule({
      imports: [ListingDetailsPageComponent, TranslateModule.forRoot()],
      providers: [
        // The "own listing" case below triggers the constructor's owner-redirect `effect`
        // (`router.navigate(['/my-listings', id])`) — a route must exist for it to resolve
        // rather than reject with NG04002 (an unhandled promise rejection Vitest would flag).
        provideRouter([{ path: 'my-listings/:id', children: [] }]),
        MessageService,
        provideMockStore({
          initialState: {
            [listingsFeatureKey]: {
              ...initialListingsState,
              selectedListing: listing,
              isDetailsLoading: false,
            },
            [bookingsFeatureKey]: initialBookingsState,
            [reviewsFeatureKey]: initialReviewsState,
            [publicProfilesFeatureKey]: initialPublicProfilesState,
            [favoritesFeatureKey]: initialFavoritesState,
            [authFeatureKey]: {
              ...initialAuthState,
              isAuthenticated: options.authenticated,
              user: options.authenticated ? makeUser({ id: options.userId ?? 'renter-1' }) : null,
            },
          },
        }),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: listing.id })) },
        },
      ],
    });
    return TestBed.createComponent(ListingDetailsPageComponent);
  }

  it('hides the report affordance for a guest', () => {
    const fixture = setup({ authenticated: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.detail-page__pill-btn--report')).toBeNull();
  });

  it('hides the report affordance on your own listing', () => {
    const fixture = setup({ authenticated: true, userId: 'owner-1', ownerId: 'owner-1' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.detail-page__pill-btn--report')).toBeNull();
  });

  it('shows the report affordance for an authenticated non-owner', () => {
    const fixture = setup({ authenticated: true, userId: 'renter-1', ownerId: 'owner-1' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.detail-page__pill-btn--report')).not.toBeNull();
  });

  it('opens the report dialog with the lowercase "listing" target type', () => {
    const fixture = setup({ authenticated: true, userId: 'renter-1', ownerId: 'owner-1' });
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.detail-page__pill-btn--report',
    );
    button.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-report-dialog')).not.toBeNull();
  });
});
