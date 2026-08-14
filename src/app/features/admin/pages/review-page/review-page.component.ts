import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslatePipe } from '@ngx-translate/core';
import { SkeletonModule } from 'primeng/skeleton';
import { MessageModule } from 'primeng/message';

import { EmptyStateComponent } from '../../../../shared/ui/empty-state/empty-state.component';
import * as ListingsActions from '../../../listings/store/listings.actions';
import { selectListingCategories } from '../../../listings/store/listings.selectors';
import { AdminPageHeaderComponent } from '../../components/admin-page-header/admin-page-header.component';
import {
  AdminTabsComponent,
  type AdminTabItem,
} from '../../components/admin-tabs/admin-tabs.component';
import { RejectSheetComponent } from '../../components/reject-sheet/reject-sheet.component';
import { ReviewCardComponent } from '../../components/review-card/review-card.component';
import type { AdminListingQueueStatusFilter } from '../../models/admin-listing-queue.model';
import * as AdminModerationActions from '../../store/admin-moderation.actions';
import {
  selectQueueActionIds,
  selectQueueCounts,
  selectQueueError,
  selectQueueItems,
  selectQueueLoading,
  selectQueuePage,
  selectQueueStatusFilter,
  selectQueueTotalPages,
} from '../../store/admin-moderation.selectors';
import { AdminBreakpointService } from '../../utils/admin-breakpoint.service';

/**
 * `/admin/review` — the redesigned moderation queue (`AdminReviewDesktop` /
 * `AdminReviewMobile`). Replaces `pending-listings-page`.
 *
 * "Which card is rejecting" plus the selected reason/note live here, not in
 * `ReviewCardComponent` — mirrors the design's own `AdminReviewDesktop`
 * (state lives in the parent, the card is presentational) and lets the same
 * two signals drive both the desktop inline panel and the mobile bottom
 * sheet.
 */
@Component({
  selector: 'app-review-page',
  standalone: true,
  imports: [
    AdminPageHeaderComponent,
    AdminTabsComponent,
    EmptyStateComponent,
    MessageModule,
    RejectSheetComponent,
    ReviewCardComponent,
    SkeletonModule,
    TranslatePipe,
  ],
  templateUrl: './review-page.component.html',
  styleUrl: './review-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewPageComponent implements OnInit {
  private readonly store = inject(Store);

  private readonly breakpoint = inject(AdminBreakpointService);
  protected readonly isDesktop = this.breakpoint.isDesktop;

  protected readonly items = this.store.selectSignal(selectQueueItems);
  protected readonly statusFilter = this.store.selectSignal(selectQueueStatusFilter);
  protected readonly counts = this.store.selectSignal(selectQueueCounts);
  protected readonly isLoading = this.store.selectSignal(selectQueueLoading);
  protected readonly error = this.store.selectSignal(selectQueueError);
  protected readonly actionIds = this.store.selectSignal(selectQueueActionIds);
  protected readonly page = this.store.selectSignal(selectQueuePage);
  protected readonly totalPages = this.store.selectSignal(selectQueueTotalPages);
  protected readonly categories = this.store.selectSignal(selectListingCategories);

  protected readonly tabs = computed<AdminTabItem[]>(() => {
    const c = this.counts();
    return [
      { id: 'Pending', labelKey: 'admin.review.tabs.pending', count: c.pending },
      { id: 'Approved', labelKey: 'admin.review.tabs.approved', count: c.approved },
      { id: 'Rejected', labelKey: 'admin.review.tabs.rejected', count: c.rejected },
    ];
  });

  protected readonly showInitialSkeleton = computed(
    () => this.isLoading() && this.items().length === 0,
  );
  protected readonly showEmpty = computed(
    () => !this.isLoading() && this.items().length === 0 && this.error() === null,
  );

  // ── Reject flow (shared desktop-inline / mobile-sheet state) ──
  protected readonly rejectingId = signal<string | null>(null);
  protected readonly reasonSel = signal<string | null>(null);
  protected readonly note = signal<string>('');

  protected readonly rejectingItem = computed(() => {
    const id = this.rejectingId();
    return id === null ? null : (this.items().find((item) => item.id === id) ?? null);
  });

  ngOnInit(): void {
    this.store.dispatch(AdminModerationActions.loadListingQueue());
    if (this.categories().length === 0) {
      this.store.dispatch(ListingsActions.loadListingCategories());
    }
  }

  protected selectTab(status: string): void {
    this.rejectingId.set(null);
    this.store.dispatch(
      AdminModerationActions.setQueueStatusFilter({
        status: status as AdminListingQueueStatusFilter,
      }),
    );
  }

  protected retry(): void {
    this.store.dispatch(AdminModerationActions.loadListingQueue());
  }

  protected isBusy(listingId: string): boolean {
    return this.actionIds().includes(listingId);
  }

  protected approve(listingId: string): void {
    this.store.dispatch(AdminModerationActions.approveListing({ listingId }));
  }

  protected openReject(listingId: string): void {
    this.rejectingId.set(listingId);
    this.reasonSel.set(null);
    this.note.set('');
  }

  protected cancelReject(): void {
    this.rejectingId.set(null);
    this.reasonSel.set(null);
    this.note.set('');
  }

  protected confirmReject(): void {
    const listingId = this.rejectingId();
    const reasonCode = this.reasonSel();
    if (listingId === null || reasonCode === null) return;
    this.store.dispatch(
      AdminModerationActions.rejectListing({ listingId, reasonCode, note: this.note().trim() }),
    );
    this.rejectingId.set(null);
    this.reasonSel.set(null);
    this.note.set('');
  }

  protected changeCategory(
    listingId: string,
    change: { categoryId: string; categoryName: string },
  ): void {
    this.store.dispatch(AdminModerationActions.updateListingCategory({ listingId, ...change }));
  }

  protected goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.store.dispatch(AdminModerationActions.setQueuePage({ page }));
  }

  protected rejectSheetTitle(): string {
    return this.rejectingItem()?.title ?? '';
  }
}
