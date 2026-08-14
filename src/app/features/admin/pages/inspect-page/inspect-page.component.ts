import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Actions, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { TranslatePipe } from '@ngx-translate/core';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { distinctUntilChanged, filter, map } from 'rxjs';

import { DramCurrencyPipe } from '../../../../shared/utils/dram-currency.pipe';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import * as ListingsActions from '../../../listings/store/listings.actions';
import { selectListingCategories } from '../../../listings/store/listings.selectors';
import { AdminCatSelectComponent } from '../../components/admin-cat-select/admin-cat-select.component';
import { AdminStatusBadgeComponent } from '../../components/admin-status-badge/admin-status-badge.component';
import { OwnerTrustPanelComponent } from '../../components/owner-trust-panel/owner-trust-panel.component';
import { RejectPanelComponent } from '../../components/reject-panel/reject-panel.component';
import { RejectSheetComponent } from '../../components/reject-sheet/reject-sheet.component';
import { computeListingCompliance } from '../../models/listing-compliance.model';
import * as AdminModerationActions from '../../store/admin-moderation.actions';
import {
  selectListingDetail,
  selectListingDetailError,
  selectListingDetailListingId,
  selectListingDetailLoading,
  selectQueueActionIds,
} from '../../store/admin-moderation.selectors';
import { AdminBreakpointService } from '../../utils/admin-breakpoint.service';

/**
 * `/admin/review/:id` — the item dossier (`AdminInspectDesktop` /
 * `AdminInspectMobile`).
 *
 * Two approved deviations from the design (see CLAUDE.md task spec):
 *  - "Message owner" is a link to the owner's public profile, not a chat
 *    action — chat is booking-scoped and an admin has no booking here.
 *  - There is no "Undo" after a decision — the backend has no un-approve
 *    endpoint. A successful approve/reject navigates back to the queue with
 *    a toast instead (the shared `AdminModerationEffects` already show it).
 *
 * One backend gap: the design's third attribute tile is "Handover: Pickup ·
 * Courier", which has no backing field — substituted with the listing's real
 * deposit amount instead of fabricating a value.
 */
@Component({
  selector: 'app-inspect-page',
  standalone: true,
  imports: [
    AdminCatSelectComponent,
    AdminStatusBadgeComponent,
    DatePipe,
    DramCurrencyPipe,
    IconComponent,
    MessageModule,
    OwnerTrustPanelComponent,
    RejectPanelComponent,
    RejectSheetComponent,
    RouterLink,
    SkeletonModule,
    TranslatePipe,
  ],
  templateUrl: './inspect-page.component.html',
  styleUrl: './inspect-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspectPageComponent implements OnInit, OnDestroy {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly actions$ = inject(Actions);
  private readonly destroyRef = inject(DestroyRef);

  private readonly breakpoint = inject(AdminBreakpointService);
  protected readonly isDesktop = this.breakpoint.isDesktop;

  private readonly routeListingId = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get('id')),
      distinctUntilChanged(),
    ),
    { initialValue: null as string | null },
  );

  protected readonly detail = this.store.selectSignal(selectListingDetail);
  protected readonly detailListingId = this.store.selectSignal(selectListingDetailListingId);
  protected readonly isLoading = this.store.selectSignal(selectListingDetailLoading);
  protected readonly error = this.store.selectSignal(selectListingDetailError);
  protected readonly actionIds = this.store.selectSignal(selectQueueActionIds);
  protected readonly categories = this.store.selectSignal(selectListingCategories);

  /** The loaded dossier only once it actually matches the routed id — avoids
   * a one-frame flash of the previous listing when navigating card → card. */
  protected readonly listing = computed(() => {
    const id = this.routeListingId();
    return id !== null && this.detailListingId() === id ? this.detail() : null;
  });

  protected readonly isBusy = computed(() => {
    const id = this.routeListingId();
    return id !== null && this.actionIds().includes(id);
  });

  protected readonly compliance = computed(() => {
    const listing = this.listing();
    return listing ? computeListingCompliance(listing) : null;
  });

  /** Admin console Phase 6 ("Needs category fix"): a pending listing with a non-null
   *  `suggestedCategoryId` shows the `flag` status badge plus the category card's suggestion
   *  banner. `AdminListingsService`'s suggestion rule already nulls the field back out once the
   *  category matches the suggestion, so re-fetching the detail after "Apply" (or any other
   *  category change) clears this on its own — no separate "dismiss" state to track here. */
  protected readonly isFlagged = computed(() => {
    const listing = this.listing();
    return (
      listing !== null &&
      listing.status === 'PendingApproval' &&
      listing.suggestedCategoryId !== null
    );
  });

  protected readonly heroIndex = signal(0);
  protected readonly isRejecting = signal(false);
  protected readonly reasonSel = signal<string | null>(null);
  protected readonly note = signal<string>('');

  constructor() {
    effect(() => {
      const id = this.routeListingId();
      if (id !== null) {
        this.store.dispatch(AdminModerationActions.loadListingDetail({ listingId: id }));
      }
      this.heroIndex.set(0);
      this.isRejecting.set(false);
      this.reasonSel.set(null);
      this.note.set('');
    });

    this.actions$
      .pipe(
        ofType(
          AdminModerationActions.approveListingSuccess,
          AdminModerationActions.rejectListingSuccess,
        ),
        filter((action) => action.listingId === this.routeListingId()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.router.navigate(['/admin/review']);
      });
  }

  ngOnInit(): void {
    if (this.categories().length === 0) {
      this.store.dispatch(ListingsActions.loadListingCategories());
    }
  }

  ngOnDestroy(): void {
    this.store.dispatch(AdminModerationActions.clearListingDetail());
  }

  protected retry(): void {
    const id = this.routeListingId();
    if (id !== null) {
      this.store.dispatch(AdminModerationActions.loadListingDetail({ listingId: id }));
    }
  }

  protected images(): { url: string }[] {
    const listing = this.listing();
    if (!listing) return [];
    if (listing.images.length > 0) {
      return listing.images.map((image) => ({ url: image.url }));
    }
    return listing.primaryImageUrl ? [{ url: listing.primaryImageUrl }] : [];
  }

  protected setHero(index: number): void {
    this.heroIndex.set(index);
  }

  protected approve(): void {
    const listing = this.listing();
    if (!listing) return;
    this.store.dispatch(AdminModerationActions.approveListing({ listingId: listing.id }));
  }

  protected openReject(): void {
    this.isRejecting.set(true);
    this.reasonSel.set(null);
    this.note.set('');
  }

  protected cancelReject(): void {
    this.isRejecting.set(false);
    this.reasonSel.set(null);
    this.note.set('');
  }

  protected confirmReject(): void {
    const listing = this.listing();
    const reasonCode = this.reasonSel();
    if (!listing || reasonCode === null) return;
    this.store.dispatch(
      AdminModerationActions.rejectListing({
        listingId: listing.id,
        reasonCode,
        note: this.note().trim(),
      }),
    );
    this.isRejecting.set(false);
  }

  protected changeCategory(change: { categoryId: string; categoryName: string }): void {
    const listing = this.listing();
    if (!listing) return;
    this.store.dispatch(
      AdminModerationActions.updateListingCategory({ listingId: listing.id, ...change }),
    );
  }

  /** The suggestion banner's one-click "Apply" — routes through the same
   *  `updateListingCategory` action as manually picking the category from `AdminCatSelect`. */
  protected applySuggestion(): void {
    const listing = this.listing();
    if (
      !listing ||
      listing.suggestedCategoryId === null ||
      listing.suggestedCategoryName === null
    ) {
      return;
    }
    this.changeCategory({
      categoryId: listing.suggestedCategoryId,
      categoryName: listing.suggestedCategoryName,
    });
  }
}
