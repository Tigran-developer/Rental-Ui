import { DecimalPipe, Location, SlicePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { ListingCardComponent } from '../../../listings/components/listing-card/listing-card.component';
import * as ListingsActions from '../../../listings/store/listings.actions';
import { ReportDialogComponent } from '../../../reports/components/report-dialog/report-dialog.component';
import { ReviewCardComponent } from '../../../reviews/components/review-card/review-card.component';
import * as ReviewsActions from '../../../reviews/store/reviews.actions';
import {
  selectOwnerReviews,
  selectOwnerReviewsLoading,
  selectRenterReviews,
  selectRenterReviewsLoading,
} from '../../../reviews/store/reviews.selectors';
import { selectAuthUser, selectIsAuthenticated } from '../../../auth/store/auth.selectors';
import * as PublicProfilesActions from '../../store/public-profiles.actions';
import {
  selectPublicProfile,
  selectPublicProfileError,
  selectPublicProfileLoading,
  selectUserListings,
  selectUserListingsLoading,
} from '../../store/public-profiles.selectors';

export type ProfileTab = 'owner' | 'renter';

@Component({
  selector: 'app-public-profile-page',
  standalone: true,
  imports: [
    ButtonModule,
    DecimalPipe,
    ListingCardComponent,
    ReportDialogComponent,
    ReviewCardComponent,
    RouterLink,
    SkeletonModule,
    SlicePipe,
    TranslatePipe,
  ],
  templateUrl: './public-profile-page.component.html',
  styleUrl: './public-profile-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicProfilePageComponent {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  protected readonly activeTab = signal<ProfileTab>('owner');

  private readonly userId$ = this.route.paramMap.pipe(
    map((params) => params.get('userId')),
    distinctUntilChanged(),
  );

  protected readonly userIdSignal = toSignal(this.userId$, { initialValue: null });

  protected readonly profile = toSignal(
    this.userId$.pipe(
      switchMap((id) => (id ? this.store.select(selectPublicProfile(id)) : of(null))),
    ),
    { initialValue: null },
  );

  protected readonly profileLoading = toSignal(
    this.userId$.pipe(
      switchMap((id) => (id ? this.store.select(selectPublicProfileLoading(id)) : of(false))),
    ),
    { initialValue: false },
  );

  protected readonly profileError = toSignal(
    this.userId$.pipe(
      switchMap((id) => (id ? this.store.select(selectPublicProfileError(id)) : of(null))),
    ),
    { initialValue: null },
  );

  private readonly ownerSummary = toSignal(
    this.userId$.pipe(
      switchMap((id) => (id ? this.store.select(selectOwnerReviews(id)) : of(null))),
    ),
    { initialValue: null },
  );

  private readonly renterSummary = toSignal(
    this.userId$.pipe(
      switchMap((id) => (id ? this.store.select(selectRenterReviews(id)) : of(null))),
    ),
    { initialValue: null },
  );

  protected readonly ownerReviews = computed(() => this.ownerSummary()?.comments ?? []);
  protected readonly renterReviews = computed(() => this.renterSummary()?.comments ?? []);

  protected readonly ownerReviewsLoading = toSignal(
    this.userId$.pipe(
      switchMap((id) => (id ? this.store.select(selectOwnerReviewsLoading(id)) : of(false))),
    ),
    { initialValue: false },
  );

  protected readonly renterReviewsLoading = toSignal(
    this.userId$.pipe(
      switchMap((id) => (id ? this.store.select(selectRenterReviewsLoading(id)) : of(false))),
    ),
    { initialValue: false },
  );

  protected readonly userListings = toSignal(
    this.userId$.pipe(
      switchMap((id) => (id ? this.store.select(selectUserListings(id)) : of(null))),
    ),
    { initialValue: null },
  );

  protected readonly userListingsLoading = toSignal(
    this.userId$.pipe(
      switchMap((id) => (id ? this.store.select(selectUserListingsLoading(id)) : of(false))),
    ),
    { initialValue: false },
  );

  protected readonly displayName = computed(() => {
    const p = this.profile();
    if (!p) return '';
    return `${p.firstName} ${p.lastName}`.trim();
  });

  protected readonly firstName = computed(() => this.profile()?.firstName ?? '');

  protected readonly initials = computed(() => {
    const p = this.profile();
    if (!p) return '';
    return `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`.toUpperCase();
  });

  protected readonly memberYear = computed(() => {
    const p = this.profile();
    if (!p) return '';
    return new Date(p.memberSince).getFullYear().toString();
  });

  protected readonly listingCount = computed(() => this.userListings()?.length ?? 0);

  protected readonly ownerReviewCount = computed(
    () => this.ownerSummary()?.reviewCount ?? this.profile()?.ownerReviewCount ?? 0,
  );

  protected readonly renterReviewCount = computed(
    () => this.renterSummary()?.reviewCount ?? this.profile()?.renterReviewCount ?? 0,
  );

  protected readonly activeReviewCount = computed(() =>
    this.activeTab() === 'owner' ? this.ownerReviewCount() : this.renterReviewCount(),
  );

  protected readonly isAuthenticated = this.store.selectSignal(selectIsAuthenticated);
  private readonly currentUser = this.store.selectSignal(selectAuthUser);

  /** The "Report this user" affordance is a safety control, not a primary action — hidden for
   *  guests (it requires authentication) and on your own profile. The server enforces the
   *  latter too via `report.cannot_report_own`, but there's no reason to ever offer it here. */
  protected readonly showReportDialog = signal(false);
  protected readonly canReportUser = computed(() => {
    const id = this.userIdSignal();
    const user = this.currentUser();
    return this.isAuthenticated() && id !== null && id !== '' && user !== null && user.id !== id;
  });

  protected readonly showSkeleton = computed(
    () => this.profileLoading() && this.profile() === null,
  );

  protected readonly showError = computed(
    () => this.profileError() !== null && this.profile() === null,
  );

  protected readonly hygieneSectionIcons: Record<string, string> = {
    spray: 'pi pi-shield',
    checklist: 'pi pi-check-circle',
    smokefree: 'pi pi-home',
    shield: 'pi pi-lock',
  };

  constructor() {
    effect(() => {
      const id = this.userIdSignal();
      if (id !== null && id !== '') {
        this.store.dispatch(PublicProfilesActions.loadPublicProfile({ userId: id }));
        this.store.dispatch(ReviewsActions.loadOwnerReviews({ userId: id }));
        this.store.dispatch(ReviewsActions.loadRenterReviews({ userId: id }));
        this.store.dispatch(PublicProfilesActions.loadUserListings({ userId: id }));
      }
    });
  }

  protected setTab(tab: ProfileTab): void {
    this.activeTab.set(tab);
  }

  protected goBack(): void {
    this.location.back();
  }

  protected retryLoad(): void {
    const id = this.userIdSignal();
    if (id !== null && id !== '') {
      this.store.dispatch(PublicProfilesActions.loadPublicProfile({ userId: id }));
      this.store.dispatch(ReviewsActions.loadOwnerReviews({ userId: id }));
      this.store.dispatch(ReviewsActions.loadRenterReviews({ userId: id }));
      this.store.dispatch(PublicProfilesActions.loadUserListings({ userId: id }));
    }
  }

  protected getHygieneIcon(iconKey: string): string {
    return this.hygieneSectionIcons[iconKey] ?? 'pi pi-check';
  }

  protected onFavoriteToggled(listingId: string): void {
    this.store.dispatch(ListingsActions.toggleFavoriteOptimistic({ listingId }));
  }

  protected openReportDialog(): void {
    if (!this.canReportUser()) return;
    this.showReportDialog.set(true);
  }

  protected closeReportDialog(): void {
    this.showReportDialog.set(false);
  }
}
