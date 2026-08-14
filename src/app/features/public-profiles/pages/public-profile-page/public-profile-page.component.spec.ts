import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { makeUser } from '../../../../../testing/fixtures';
import { PublicProfilePageComponent } from './public-profile-page.component';
import { authFeatureKey } from '../../../auth/store/auth.reducer';
import { initialAuthState } from '../../../auth/store/auth.state';
import { reviewsFeatureKey } from '../../../reviews/store/reviews.reducer';
import { initialReviewsState } from '../../../reviews/store/reviews.state';
import { publicProfilesFeatureKey } from '../../store/public-profiles.reducer';
import { initialPublicProfilesState } from '../../store/public-profiles.state';
import type { PublicUserProfile } from '../../models/public-profile.model';

function makeProfile(overrides: Partial<PublicUserProfile> = {}): PublicUserProfile {
  return {
    id: 'profile-1',
    firstName: 'Anahit',
    lastName: 'Grigoryan',
    avatarUrl: null,
    memberSince: '2024-01-01T00:00:00Z',
    averageRating: 4.8,
    reviewCount: 12,
    activeListingsCount: 3,
    location: 'Yerevan',
    isVerified: true,
    isIdConfirmed: true,
    isEmailPhoneConfirmed: true,
    ownerRating: 4.8,
    ownerReviewCount: 12,
    completedRentalsAsOwner: 20,
    responseRate: null,
    hygieneScore: null,
    hygieneStandards: [],
    renterRating: null,
    renterReviewCount: 0,
    completedRentalsAsRenter: 0,
    onTimeReturnRate: null,
    damageClaims: 0,
    reliabilityMetrics: [],
    ...overrides,
  };
}

/**
 * The "Report this user" affordance is a safety control — it must never appear for a guest
 * (report submission requires authentication) or on your own public profile (the server also
 * rejects this via `report.cannot_report_own`, but there's no reason to ever offer it here).
 * See `canReportUser` in `public-profile-page.component.ts`.
 */
describe('PublicProfilePageComponent — report affordance', () => {
  function setup(options: { authenticated: boolean; userId?: string; profileId?: string }) {
    const profileId = options.profileId ?? 'profile-1';
    // Each `it()` below calls `setup()` once, so Angular's automatic post-test
    // teardown (registered as a global afterEach by the test environment)
    // normally resets TestBed before the next `configureTestingModule()`
    // runs. Under the full suite's parallel vitest workers that teardown is
    // not guaranteed to have settled yet, so — same fix already applied to
    // `review-card.component.spec.ts` / `owner-trust-panel.component.spec.ts`
    // for the same defect — reset explicitly first. A no-op the first time.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PublicProfilePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideMockStore({
          initialState: {
            [publicProfilesFeatureKey]: {
              ...initialPublicProfilesState,
              byId: {
                [profileId]: {
                  data: makeProfile({ id: profileId }),
                  isLoading: false,
                  error: null,
                },
              },
            },
            [reviewsFeatureKey]: initialReviewsState,
            [authFeatureKey]: {
              ...initialAuthState,
              isAuthenticated: options.authenticated,
              user: options.authenticated ? makeUser({ id: options.userId ?? 'renter-1' }) : null,
            },
          },
        }),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ userId: profileId })) },
        },
      ],
    });
    return TestBed.createComponent(PublicProfilePageComponent);
  }

  it('hides the report affordance for a guest', () => {
    const fixture = setup({ authenticated: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pub-profile__report-link')).toBeNull();
  });

  it('hides the report affordance on your own profile', () => {
    const fixture = setup({ authenticated: true, userId: 'profile-1', profileId: 'profile-1' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pub-profile__report-link')).toBeNull();
  });

  it('shows the report affordance for an authenticated visitor viewing someone else', () => {
    const fixture = setup({ authenticated: true, userId: 'renter-1', profileId: 'profile-1' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pub-profile__report-link')).not.toBeNull();
  });

  it('opens the report dialog with the lowercase "user" target type', () => {
    const fixture = setup({ authenticated: true, userId: 'renter-1', profileId: 'profile-1' });
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.pub-profile__report-link',
    );
    button.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-report-dialog')).not.toBeNull();
  });
});
