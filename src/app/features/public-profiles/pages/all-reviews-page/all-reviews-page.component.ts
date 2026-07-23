import { DecimalPipe, Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { ReviewCardLargeComponent } from '../../../reviews/components/review-card-large/review-card-large.component';
import type { ReviewComment } from '../../../reviews/models/review.model';
import * as ReviewsActions from '../../../reviews/store/reviews.actions';
import {
  selectOwnerReviews,
  selectOwnerReviewsError,
  selectOwnerReviewsLoading,
  selectRenterReviews,
  selectRenterReviewsError,
  selectRenterReviewsLoading,
} from '../../../reviews/store/reviews.selectors';
import * as PublicProfilesActions from '../../store/public-profiles.actions';
import {
  selectPublicProfile,
  selectPublicProfileLoading,
} from '../../store/public-profiles.selectors';

export type ReviewTab = 'owner' | 'renter';
export type SortOrder = 'recent' | 'highest';

function sortReviews(
  reviews: readonly ReviewComment[],
  sort: SortOrder,
): readonly ReviewComment[] {
  if (sort === 'highest') {
    return [...reviews].sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
  }
  return [...reviews].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

@Component({
  selector: 'app-all-reviews-page',
  standalone: true,
  imports: [
    ButtonModule,
    DecimalPipe,
    ReviewCardLargeComponent,
    RouterLink,
    SkeletonModule,
    TranslatePipe,
  ],
  templateUrl: './all-reviews-page.component.html',
  styleUrl: './all-reviews-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllReviewsPageComponent {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  protected readonly activeTab = signal<ReviewTab>('owner');
  protected readonly sortOrder = signal<SortOrder>('recent');

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

  protected readonly ownerSummary = toSignal(
    this.userId$.pipe(
      switchMap((id) => (id ? this.store.select(selectOwnerReviews(id)) : of(null))),
    ),
    { initialValue: null },
  );

  protected readonly ownerLoading = toSignal(
    this.userId$.pipe(
      switchMap((id) => (id ? this.store.select(selectOwnerReviewsLoading(id)) : of(false))),
    ),
    { initialValue: false },
  );

  protected readonly ownerError = toSignal(
    this.userId$.pipe(
      switchMap((id) => (id ? this.store.select(selectOwnerReviewsError(id)) : of(null))),
    ),
    { initialValue: null },
  );

  protected readonly renterSummary = toSignal(
    this.userId$.pipe(
      switchMap((id) => (id ? this.store.select(selectRenterReviews(id)) : of(null))),
    ),
    { initialValue: null },
  );

  protected readonly renterLoading = toSignal(
    this.userId$.pipe(
      switchMap((id) => (id ? this.store.select(selectRenterReviewsLoading(id)) : of(false))),
    ),
    { initialValue: false },
  );

  protected readonly renterError = toSignal(
    this.userId$.pipe(
      switchMap((id) => (id ? this.store.select(selectRenterReviewsError(id)) : of(null))),
    ),
    { initialValue: null },
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

  protected readonly activeSummary = computed(() =>
    this.activeTab() === 'owner' ? this.ownerSummary() : this.renterSummary(),
  );

  protected readonly activeLoading = computed(() =>
    this.activeTab() === 'owner' ? this.ownerLoading() : this.renterLoading(),
  );

  protected readonly activeError = computed(() =>
    this.activeTab() === 'owner' ? this.ownerError() : this.renterError(),
  );

  protected readonly displayedReviews = computed((): readonly ReviewComment[] => {
    const reviews = this.activeSummary()?.comments ?? [];
    return sortReviews(reviews, this.sortOrder());
  });

  protected readonly ownerBreakdown = computed(() => {
    const s = this.ownerSummary();
    if (!s) return [];
    return [
      { key: 'allReviews.breakdownCommunication', value: s.communicationAverage },
      { key: 'allReviews.breakdownPickup',        value: s.pickupHandoverAverage },
      { key: 'allReviews.breakdownFriendliness',  value: s.friendlinessAverage },
    ];
  });

  protected readonly renterBreakdown = computed(() => {
    const s = this.renterSummary();
    if (!s) return [];
    return [
      { key: 'allReviews.breakdownCommunication',   value: s.communicationAverage },
      { key: 'allReviews.breakdownReturnedOnTime',  value: s.returnedOnTimeAverage },
      { key: 'allReviews.breakdownCareOfToy',       value: s.careOfToyAverage },
      { key: 'allReviews.breakdownWouldRentAgain',  value: s.wouldRentAgainAverage },
    ];
  });

  protected readonly activeBreakdown = computed(() =>
    this.activeTab() === 'owner' ? this.ownerBreakdown() : this.renterBreakdown(),
  );

  protected readonly showReviewsSkeleton = computed(
    () => this.activeLoading() && this.activeSummary() === null,
  );

  protected readonly starsForDisplay = [5, 4, 3, 2, 1] as const;

  protected distributionCount(star: number): number {
    const dist = this.activeSummary()?.distribution ?? [];
    return dist[star - 1] ?? 0;
  }

  protected distributionPercent(star: number): number {
    const total = this.activeSummary()?.reviewCount ?? 0;
    if (total === 0) return 0;
    return (this.distributionCount(star) / total) * 100;
  }

  constructor() {
    effect(() => {
      const id = this.userIdSignal();
      if (id) {
        this.store.dispatch(PublicProfilesActions.loadPublicProfile({ userId: id }));
        this.store.dispatch(ReviewsActions.loadOwnerReviews({ userId: id }));
        this.store.dispatch(ReviewsActions.loadRenterReviews({ userId: id }));
      }
    });

    // Read initial tab from query param
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab === 'renter') this.activeTab.set('renter');
  }

  protected setTab(tab: ReviewTab): void {
    this.activeTab.set(tab);
    this.sortOrder.set('recent');
  }

  protected setSortOrder(sort: SortOrder): void {
    this.sortOrder.set(sort);
  }

  protected goBack(): void {
    this.location.back();
  }

  protected retry(): void {
    const id = this.userIdSignal();
    if (!id) return;
    if (this.activeTab() === 'owner') {
      this.store.dispatch(ReviewsActions.loadOwnerReviews({ userId: id }));
    } else {
      this.store.dispatch(ReviewsActions.loadRenterReviews({ userId: id }));
    }
  }
}
