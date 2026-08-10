import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { StarRatingComponent } from '../../../../shared/ui/star-rating/star-rating.component';

export type RatingSummaryVariant = 'compact' | 'full';

export interface RatingSummaryView {
  readonly average: number;
  readonly reviewCount: number;
  readonly hasAggregate: boolean;
}

@Component({
  selector: 'app-rating-summary',
  standalone: true,
  imports: [StarRatingComponent, TranslatePipe],
  templateUrl: './rating-summary.component.html',
  styleUrl: './rating-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RatingSummaryComponent {
  readonly summary = input.required<RatingSummaryView>();
  readonly variant = input<RatingSummaryVariant>('compact');
  /**
   * Optional 5-star breakdown, index 0 = 1★ … index 4 = 5★ (matches the
   * backend's `distribution: int[5]`). Only meaningful for `variant="full"` —
   * when provided (and `hasAggregate` is true) the full variant renders the
   * two-column panel with distribution bars instead of the plain stacked
   * summary. Existing `full` consumers that don't pass this keep the
   * original stacked layout unchanged.
   */
  readonly distribution = input<readonly number[] | null>(null);

  // Numbers are only shown once the aggregate threshold is met.
  protected readonly hasRatings = computed(() => this.summary().hasAggregate);

  protected readonly formattedAverage = computed(() => {
    const avg = this.summary().average;
    return avg > 0 ? avg.toFixed(1) : '—';
  });

  protected readonly roundedRating = computed(() => Math.round(this.summary().average));

  protected readonly showDistribution = computed(
    () =>
      this.variant() === 'full' &&
      this.hasRatings() &&
      (this.distribution()?.length ?? 0) === 5,
  );

  protected readonly starsDesc = [5, 4, 3, 2, 1] as const;

  protected distCount(star: number): number {
    return this.distribution()?.[star - 1] ?? 0;
  }

  protected distPercent(star: number): number {
    const total = this.summary().reviewCount;
    if (total <= 0) return 0;
    return Math.round((this.distCount(star) / total) * 100);
  }
}
