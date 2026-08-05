import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { BookingCalendarComponent } from '../../components/booking-calendar/booking-calendar.component';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header.component';
import { DramCurrencyPipe } from '../../../../shared/utils/dram-currency.pipe';
import * as BookingsActions from '../../../bookings/store/bookings.actions';
import {
  selectCreateBookingError,
  selectCreateBookingLoading,
  selectCreateBookingSuccessId,
} from '../../../bookings/store/bookings.selectors';
import * as ListingsActions from '../../store/listings.actions';
import { selectSelectedListing } from '../../store/listings.selectors';
import type { ListingImage } from '../../models/listing.model';
import * as PublicProfilesActions from '../../../public-profiles/store/public-profiles.actions';
import { selectPublicProfile } from '../../../public-profiles/store/public-profiles.selectors';
import * as ReviewsActions from '../../../reviews/store/reviews.actions';
import { selectOwnerReviews } from '../../../reviews/store/reviews.selectors';
import * as ChatActions from '../../../chat/store/chat.actions';
import { selectOpeningConversationFromBooking } from '../../../chat/store/chat.selectors';

interface QuickBookOption {
  readonly key: string;
  readonly labelKey: string;
  readonly days: number;
}

const QUICK_BOOK_OPTIONS: readonly QuickBookOption[] = [
  { key: 'day', labelKey: 'listings.bookingPage.quick.day', days: 1 },
  { key: 'week', labelKey: 'listings.bookingPage.quick.week', days: 7 },
  { key: 'month', labelKey: 'listings.bookingPage.quick.month', days: 30 },
  { key: 'year', labelKey: 'listings.bookingPage.quick.year', days: 365 },
];

const SUGGESTION_CHIP_KEYS: readonly string[] = [
  'listings.bookingPage.suggestion.chip1',
  'listings.bookingPage.suggestion.chip2',
  'listings.bookingPage.suggestion.chip3',
  'listings.bookingPage.suggestion.chip4',
];

function countInclusiveRentalDays(start: Date, end: Date): number {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const diffDays = Math.floor((endUtc - startUtc) / 86_400_000);
  return diffDays < 0 ? 0 : diffDays + 1;
}

function toLocalIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPrimaryImage(images: ListingImage[]): string | null {
  if (images.length === 0) return null;
  return images.find((i) => i.isPrimary)?.url ?? images[0]?.url ?? null;
}

interface BookingForm {
  dateRange: FormControl<Date[] | null>;
  noteForOwner: FormControl<string>;
}

@Component({
  selector: 'app-listing-booking-page',
  standalone: true,
  imports: [
    BookingCalendarComponent,
    ButtonModule,
    DramCurrencyPipe,
    DecimalPipe,
    PageHeaderComponent,
    ReactiveFormsModule,
    TranslatePipe,
  ],
  templateUrl: './listing-booking-page.component.html',
  styleUrl: './listing-booking-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListingBookingPageComponent {
  private readonly store = inject(Store);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly translate = inject(TranslateService);

  // Mirrors the server (`CreateBookingRequest.note` — see BOOKING_ERROR_MESSAGE_KEYS
  // in bookings.effects.ts): the server trims first, then rejects anything over 280
  // chars, so the client trims before length-checking too (see onSubmit()).
  protected readonly NOTE_MAX_LENGTH = 280;
  /** Counter turns warn-coloured once fewer than this many characters remain. */
  private readonly NOTE_WARN_REMAINING = 30;
  protected readonly quickBookOptions = QUICK_BOOK_OPTIONS;
  protected readonly suggestionChipKeys = SUGGESTION_CHIP_KEYS;

  private readonly routeId$ = this.route.paramMap.pipe(
    map((params) => params.get('id')),
    distinctUntilChanged(),
  );

  protected readonly listingId = toSignal(this.routeId$, {
    initialValue: null as string | null,
  });

  protected readonly listing = this.store.selectSignal(selectSelectedListing);
  protected readonly submitting = this.store.selectSignal(selectCreateBookingLoading);
  protected readonly submitError = this.store.selectSignal(selectCreateBookingError);
  private readonly successId = this.store.selectSignal(selectCreateBookingSuccessId);
  protected readonly openingConversation = this.store.selectSignal(
    selectOpeningConversationFromBooking,
  );

  /** Focus target for the confirmation state — moved there once it renders (a11y). */
  private readonly confirmHeading = viewChild<ElementRef<HTMLElement>>('confirmHeading');

  // ── Owner trust signals (for the "Your request" card) ──────────────
  private readonly ownerId$ = this.store.select(selectSelectedListing).pipe(
    map((listing) => listing?.owner?.id ?? null),
    distinctUntilChanged(),
  );

  protected readonly ownerPublicProfile = toSignal(
    this.ownerId$.pipe(
      switchMap((id) => (id ? this.store.select(selectPublicProfile(id)) : of(null))),
    ),
    { initialValue: null },
  );

  private readonly ownerReviewsSummary = toSignal(
    this.ownerId$.pipe(
      switchMap((id) => (id ? this.store.select(selectOwnerReviews(id)) : of(null))),
    ),
    { initialValue: null },
  );

  protected readonly ownerSummary = computed(() => {
    const s = this.ownerReviewsSummary();
    return s && s.hasAggregate
      ? { averageRating: s.overallAverage, reviewCount: s.reviewCount }
      : null;
  });

  protected readonly ownerName = computed(() => {
    const owner = this.listing()?.owner;
    return owner ? `${owner.firstName} ${owner.lastName}`.trim() : '';
  });

  protected readonly ownerFirstName = computed(() => this.listing()?.owner?.firstName ?? '');

  protected readonly ownerInitials = computed(() => {
    const owner = this.listing()?.owner;
    if (!owner) return '';
    return ((owner.firstName?.[0] ?? '') + (owner.lastName?.[0] ?? '')).toUpperCase();
  });

  protected readonly startDate = signal<Date | null>(null);
  protected readonly endDate = signal<Date | null>(null);
  protected readonly selectedQuickBook = signal<QuickBookOption | null>(null);
  protected readonly controlledRange = signal<Date[] | null>(null);

  protected readonly form: FormGroup<BookingForm> = this.fb.group<BookingForm>({
    dateRange: new FormControl<Date[] | null>(null),
    noteForOwner: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.maxLength(this.NOTE_MAX_LENGTH)],
    }),
  });

  protected readonly noteValue = toSignal(
    this.form.controls.noteForOwner.valueChanges,
    { initialValue: '' },
  );

  protected readonly noteLength = computed(() => this.noteValue().length);
  protected readonly noteNearLimit = computed(
    () => this.NOTE_MAX_LENGTH - this.noteLength() < this.NOTE_WARN_REMAINING,
  );
  /** Snapshot of what was actually sent, captured at submit time so the confirmation's
   * note echo can't drift if the form were ever touched again before it unmounts. */
  protected readonly sentNote = signal<string | null>(null);

  protected readonly rentalDays = computed(() => {
    const start = this.startDate();
    const end = this.endDate();
    if (start === null || end === null) return 0;
    return countInclusiveRentalDays(start, end);
  });

  protected readonly totalPrice = computed(() => {
    const days = this.rentalDays();
    const price = this.listing()?.pricePerDay;
    if (days <= 0 || !price) return null;
    return days * price;
  });

  // Shown as its own breakdown row — refundable, collected by the owner off-platform,
  // and deliberately NOT folded into totalPrice()/Total above (product decision).
  protected readonly depositAmount = computed(() => this.listing()?.depositAmount ?? null);

  protected readonly primaryImageUrl = computed(() => {
    const images = this.listing()?.images;
    return images ? getPrimaryImage(images) : null;
  });

  protected readonly canSubmit = computed(
    () =>
      this.startDate() !== null &&
      this.endDate() !== null &&
      this.rentalDays() > 0 &&
      !this.submitting() &&
      this.form.controls.noteForOwner.valid,
  );

  protected readonly isSuccess = computed(() => this.successId() !== null);

  constructor() {
    effect(() => {
      const id = this.listingId();
      if (id !== null && id !== '') {
        this.store.dispatch(ListingsActions.loadListingDetails({ id }));
        this.store.dispatch(BookingsActions.clearCreateBookingState());
      }
    });

    // Load owner trust data once the listing's owner is known.
    effect(() => {
      const ownerId = this.listing()?.owner?.id;
      if (ownerId) {
        this.store.dispatch(ReviewsActions.loadOwnerReviews({ userId: ownerId }));
        this.store.dispatch(PublicProfilesActions.loadPublicProfile({ userId: ownerId }));
      }
    });

    // Move focus into the confirmation card once it renders, so assistive tech
    // announces it immediately instead of leaving focus on the (now gone) submit
    // button. Deferred a tick: the @if branch swap hasn't painted the heading yet
    // in the same change-detection pass that flips isSuccess().
    effect(() => {
      if (this.isSuccess()) {
        setTimeout(() => this.confirmHeading()?.nativeElement.focus());
      }
    });
  }

  protected applyQuickBook(option: QuickBookOption): void {
    if (this.selectedQuickBook()?.key === option.key) {
      this.selectedQuickBook.set(null);
      this.controlledRange.set([]);
      this.startDate.set(null);
      this.endDate.set(null);
      this.form.controls.dateRange.setValue(null);
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + option.days - 1);
    this.selectedQuickBook.set(option);
    this.controlledRange.set([today, end]);
    this.startDate.set(today);
    this.endDate.set(end);
    this.form.controls.dateRange.setValue([today, end]);
  }

  protected onRangeChange(event: { startDate: Date | null; endDate: Date | null }): void {
    this.startDate.set(event.startDate);
    this.endDate.set(event.endDate);
    this.selectedQuickBook.set(null);
    this.controlledRange.set(null);
    const range =
      event.startDate && event.endDate ? [event.startDate, event.endDate] : null;
    this.form.controls.dateRange.setValue(range);
  }

  /** Appends a suggestion-chip phrase (by i18n key) to the owner note, respecting maxlength. */
  protected appendChip(chipKey: string): void {
    const text = this.translate.instant(chipKey);
    const control = this.form.controls.noteForOwner;
    const current = control.value.trim();
    const separator = current.length > 0 ? ' ' : '';
    const next = `${current}${separator}${text}`.slice(0, this.NOTE_MAX_LENGTH);
    control.setValue(next);
    control.markAsDirty();
  }

  protected onSubmit(): void {
    const start = this.startDate();
    const end = this.endDate();
    const listingId = this.listingId();
    if (!start || !end || !listingId || !this.canSubmit()) return;

    // Mirror the server: trim first, then treat an empty/whitespace-only note as
    // absent (send null, not "") rather than a real note.
    const trimmed = this.form.controls.noteForOwner.value.trim();
    const note = trimmed.length > 0 ? trimmed : null;
    this.sentNote.set(note);

    this.store.dispatch(BookingsActions.clearCreateBookingState());
    this.store.dispatch(
      BookingsActions.createBooking({
        payload: {
          listingId,
          startDate: toLocalIsoDate(start),
          endDate: toLocalIsoDate(end),
          note,
        },
      }),
    );
  }

  protected onViewBooking(): void {
    const id = this.successId();
    if (id) {
      void this.router.navigate(['/bookings', id]);
    }
  }

  /** "Message {owner}" on the confirmation card — opens/creates the booking's
   * conversation via the chat store and lets ChatEffects navigate there. */
  protected onMessageOwner(): void {
    const bookingId = this.successId();
    if (bookingId) {
      this.store.dispatch(ChatActions.openConversationFromBooking({ bookingId }));
    }
  }
}
