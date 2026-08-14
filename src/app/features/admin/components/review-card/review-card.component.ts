import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import type { ListingCategoryOption } from '../../../listings/models/create-listing.model';
import { DramCurrencyPipe } from '../../../../shared/utils/dram-currency.pipe';
import { AvatarComponent } from '../../../../shared/ui/avatar/avatar.component';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { AdminCatSelectComponent } from '../admin-cat-select/admin-cat-select.component';
import { AdminStatusBadgeComponent } from '../admin-status-badge/admin-status-badge.component';
import { CheckPillComponent } from '../check-pill/check-pill.component';
import { RejectPanelComponent } from '../reject-panel/reject-panel.component';
import { computeListingCompliance } from '../../models/listing-compliance.model';
import type {
  AdminListingQueueStatusFilter,
  AdminListingSummary,
} from '../../models/admin-listing-queue.model';

/**
 * The design's `AdminReviewDesktop`/`AdminReviewMobile` submission card. One
 * component, responsive via `isDesktop` (photo size, actions layout, and
 * whether the reject reason panel expands inline or the page opens the
 * shared bottom sheet instead) — see `ReviewPageComponent` for why the
 * "which card is rejecting" and reason/note state live one level up (mirrors
 * the design's own `AdminReviewDesktop`, which keeps that state in the
 * parent rather than each card).
 */
@Component({
  selector: 'app-review-card',
  standalone: true,
  imports: [
    AdminCatSelectComponent,
    AdminStatusBadgeComponent,
    AvatarComponent,
    CheckPillComponent,
    DramCurrencyPipe,
    IconComponent,
    RejectPanelComponent,
    RouterLink,
    TranslatePipe,
  ],
  templateUrl: './review-card.component.html',
  styleUrl: './review-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewCardComponent {
  readonly item = input.required<AdminListingSummary>();
  readonly tab = input.required<AdminListingQueueStatusFilter>();
  readonly categories = input<ListingCategoryOption[]>([]);
  readonly isDesktop = input<boolean>(true);
  readonly isBusy = input<boolean>(false);
  readonly isRejectOpen = input<boolean>(false);
  readonly reasonSel = input<string | null>(null);
  readonly note = input<string>('');

  readonly approve = output<void>();
  readonly openReject = output<void>();
  readonly cancelReject = output<void>();
  readonly reasonSelect = output<string>();
  readonly noteChange = output<string>();
  readonly confirmReject = output<void>();
  readonly categoryChange = output<{ categoryId: string; categoryName: string }>();

  protected readonly isDecided = computed(() => this.tab() !== 'Pending');

  /** Admin console Phase 6 ("Needs category fix"): a pending listing with a non-null
   *  `suggestedCategoryId` shows the `flag` status badge instead of `pending`, plus an
   *  explanatory line, and tints the category select — see `admin-status-badge`'s `flag`
   *  variant and `AdminCatSelectComponent.flagged`. Decided listings never show it (the design's
   *  `flagged = s.flagCategory && !decided`) — approving/rejecting is the terminal action, the
   *  category call is already made. */
  protected readonly isFlagged = computed(
    () => this.tab() === 'Pending' && this.item().suggestedCategoryId !== null,
  );

  protected readonly ownerName = computed(() => {
    const item = this.item();
    return `${item.ownerFirstName} ${item.ownerLastName}`.trim();
  });

  protected readonly compliance = computed(() => computeListingCompliance(this.item()));

  /**
   * Two-form pluralisation idiom (see `CategoryDeleteDialogComponent.hasListingsKey`) —
   * ngx-translate has no ICU/plural-rules support, so the singular case gets its own key
   * per locale rather than reusing the `{{count}}`-interpolated "N listings" string for N=1.
   */
  protected readonly listingCountKey = computed(() =>
    this.item().ownerListingCount === 1
      ? 'admin.review.card.listingCountOne'
      : 'admin.review.card.listingCount',
  );

  protected readonly detailPath = computed<[string, string]>(() => [
    '/admin/review',
    this.item().id,
  ]);

  protected onCategoryChange(change: { categoryId: string; categoryName: string }): void {
    this.categoryChange.emit(change);
  }
}
