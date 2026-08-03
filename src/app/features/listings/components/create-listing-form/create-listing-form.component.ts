import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Location } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { AbstractControl, ValidationErrors } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { InputNumberModule } from 'primeng/inputnumber';

import { AgeRangeSliderComponent } from '../../../../shared/ui/age-range-slider/age-range-slider.component';
import { CategorySelectorComponent } from '../../../../shared/ui/category-selector/category-selector.component';
import { UiInputComponent } from '../../../../shared/ui/input/ui-input.component';
import { MapComponent } from '../../../../shared/ui/map/map.component';
import type { MapLatLng } from '../../../../shared/ui/map/map.component';
import { LanguageService } from '../../../../shared/services/language.service';
import { DramCurrencyPipe } from '../../../../shared/utils/dram-currency.pipe';
import type {
  CreateListingRequest,
  DeliveryType,
  ListingCategoryOption,
  PriceUnit,
} from '../../models/create-listing.model';
import { PRICE_UNITS } from '../../models/create-listing.model';
import type { ListingDistrict } from '../../models/district.model';
import { districtDisplayName } from '../../models/district-ui.util';
import type { ListingImage } from '../../models/listing.model';
import {
  LocationPickerComponent,
  YEREVAN_CENTER,
} from '../location-picker/location-picker.component';

/** Whether the wizard creates a new listing or edits an existing one. */
export type ListingFormMode = 'create' | 'edit';

/**
 * Existing listing values used to pre-populate the wizard in edit mode. Photos
 * are passed separately via `existingImageUrls`.
 */
export interface ListingFormPrefill {
  title: string;
  description: string;
  categoryId: string;
  pricePerDay: number | null;
  priceUnit?: PriceUnit;
  city: string;
  ageFromMonths: number | null;
  ageToMonths: number | null;
  condition: string | null;
  hygieneNotes: string | null;
  safetyNotes: string | null;
  /** Shortest bookable period, in days. Falls back to the 1-day default. */
  minRentalDays?: number | null;
  /** How the toy is handed over. Falls back to 'Pickup'. */
  deliveryType?: DeliveryType | null;
}

/**
 * One photo in the edit-mode gallery. Existing photos carry their server `id`;
 * freshly picked ones carry the `File` to upload. Both live in a single ordered
 * list so new photos behave exactly like existing ones — they can be reordered,
 * removed, or promoted to cover (index 0).
 */
interface EditPhoto {
  url: string;
  existingId: string | null;
  file: File | null;
}

/**
 * Final photo order emitted in edit mode. Each entry is either an existing image
 * (by id) or a newly added file (by its index within the emitted `files` array),
 * letting the page resolve real ids after upload and reorder the full set.
 */
export interface ListingImageOrderItem {
  existingId: string | null;
  newFileIndex: number | null;
}

interface ConditionChip {
  readonly value: 'New' | 'LikeNew' | 'Good' | 'Fair';
  readonly labelKey: string;
}

interface WizardStep {
  /** Long title — used in the mobile header and the desktop <h1>. */
  readonly labelKey: string;
  /** Short title — used only in the desktop sidebar rail. */
  readonly shortLabelKey: string;
  readonly subKey: string;
  readonly icon: string;
}

const CONDITION_CHIPS: readonly ConditionChip[] = [
  { value: 'New', labelKey: 'listings.createForm.conditionOptions.new' },
  { value: 'LikeNew', labelKey: 'listings.createForm.conditionOptions.likeNew' },
  { value: 'Good', labelKey: 'listings.createForm.conditionOptions.good' },
  { value: 'Fair', labelKey: 'listings.createForm.conditionOptions.fair' },
];

const WIZARD_STEPS: readonly WizardStep[] = [
  {
    labelKey: 'listings.createPage.wizard.step1Label',
    shortLabelKey: 'listings.createPage.wizard.step1Short',
    subKey: 'listings.createPage.wizard.step1Sub',
    icon: 'pi-camera',
  },
  {
    labelKey: 'listings.createPage.wizard.step2Label',
    shortLabelKey: 'listings.createPage.wizard.step2Short',
    subKey: 'listings.createPage.wizard.step2Sub',
    icon: 'pi-tag',
  },
  {
    labelKey: 'listings.createPage.wizard.step3Label',
    shortLabelKey: 'listings.createPage.wizard.step3Short',
    subKey: 'listings.createPage.wizard.step3Sub',
    icon: 'pi-map-marker',
  },
  {
    labelKey: 'listings.createPage.wizard.step4Label',
    shortLabelKey: 'listings.createPage.wizard.step4Short',
    subKey: 'listings.createPage.wizard.step4Sub',
    icon: 'pi-shield',
  },
  {
    labelKey: 'listings.createPage.wizard.step5Label',
    shortLabelKey: 'listings.createPage.wizard.step5Short',
    subKey: 'listings.createPage.wizard.step5Sub',
    icon: 'pi-check',
  },
];

const MIN_RENTAL_DAYS = [1, 3, 7, 14] as const;

/** Listings are currently Armenia-only; kept out of the template (no literal). */
const DEFAULT_COUNTRY = 'Armenia';

/**
 * Smallest allowed price. Dram has no practical minor unit — nobody prices a
 * rental at 2500.50 ֏ — so the floor is a whole 1 ֏ (i.e. "greater than
 * zero"), not a real minimum-price business rule.
 */
const MIN_PRICE_PER_DAY = 1;

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 8;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const AGE_MAX_YEARS = 12;

const STEP_CONTROLS: readonly string[][] = [
  [], // 1 Photos (gated on photo count)
  ['title', 'categoryId', 'description'], // 2 Basics
  ['pricePerDay', 'priceUnit', 'city'], // 3 Pricing & Location
  [], // 4 Safety
  [], // 5 Preview
];

function ageRangeValidator(control: AbstractControl): ValidationErrors | null {
  const from = control.get('ageFromMonths')?.value;
  const to = control.get('ageToMonths')?.value;
  if (typeof from === 'number' && typeof to === 'number' && to < from) {
    return { ageRangeInvalid: true };
  }
  return null;
}

@Component({
  selector: 'app-create-listing-form',
  standalone: true,
  imports: [
    AgeRangeSliderComponent,
    CategorySelectorComponent,
    DramCurrencyPipe,
    InputNumberModule,
    LocationPickerComponent,
    MapComponent,
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    UiInputComponent,
  ],
  templateUrl: './create-listing-form.component.html',
  styleUrls: [
    './create-listing-form.component.scss',
    './create-listing-form.menu.scss',
    './create-listing-form.step5.scss',
    './create-listing-form.desktop.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateListingFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly location = inject(Location);
  private readonly languageService = inject(LanguageService);

  constructor() {
    // The location-picker trigger's post-close focus return (see
    // `closeLocationPicker` below) has to wait for the `hasPin()` template
    // swap to actually land in the DOM before it can query the right node —
    // `afterRenderEffect` (same primitive `conversation-details-page` uses to
    // scroll after new messages render) guarantees that ordering, unlike a
    // microtask which fires before Angular re-renders.
    afterRenderEffect(() => {
      if (!this.focusReturnPending()) {
        return;
      }
      this.locationPickerTrigger()?.nativeElement.focus();
      this.focusReturnPending.set(false);
    });
  }

  @Input() categories: ListingCategoryOption[] = [];
  /** The 12 fixed Yerevan districts. Optional owner override for the pin's
   *  derived district (see `district.id` control below); an empty list just
   *  means the select has no options yet (still loading, or the call failed —
   *  the field stays optional either way). */
  @Input() districts: ListingDistrict[] = [];
  @Input() isSubmitting = false;
  @Input() createError: string | null = null;
  @Input() uploadProgress: number | null = null;
  @Input() imageUploadError: string | null = null;

  /** 'create' (default) builds a new listing; 'edit' pre-fills and keeps photos. */
  @Input() mode: ListingFormMode = 'create';
  /** i18n key for the final submit button (lets edit mode say "Save & resubmit"). */
  @Input() submitLabelKey = 'listings.createPage.wizard.submitForReview';

  /**
   * Edit mode only: the full ordered photo gallery (existing + newly added). The
   * first entry is the cover. New photos are appended at the end and behave like
   * any other photo. Rebuilt whenever the bound existing images change.
   */
  readonly editGallery = signal<EditPhoto[]>([]);
  @Input() set existingImageUrls(images: ListingImage[] | null | undefined) {
    const imgs = images ?? [];
    this.editGallery.set(imgs.map((i) => ({ url: i.url, existingId: i.id || null, file: null })));
  }

  /** Pre-fills every field in edit mode. Applied once a value is bound. */
  @Input() set prefill(value: ListingFormPrefill | null) {
    if (!value) return;
    this.createListingForm.patchValue({
      title: value.title,
      description: value.description,
      categoryId: value.categoryId,
      pricePerDay: value.pricePerDay,
      priceUnit: value.priceUnit ?? 'Daily',
      city: value.city,
      ageFromMonths: value.ageFromMonths,
      ageToMonths: value.ageToMonths,
      condition: (value.condition as ConditionChip['value'] | null) ?? '',
      hygieneNotes: value.hygieneNotes ?? '',
      safetyNotes: value.safetyNotes ?? '',
      // Listings created before these fields existed carry null — fall back to
      // the same defaults a fresh wizard starts with.
      minRentalDays: value.minRentalDays ?? 1,
      deliveryType: value.deliveryType ?? 'Pickup',
    });
    if (typeof value.ageFromMonths === 'number' && typeof value.ageToMonths === 'number') {
      this.ageYears.set([Math.round(value.ageFromMonths / 12), Math.round(value.ageToMonths / 12)]);
    }
    const cond = value.condition as ConditionChip['value'] | null;
    if (cond && CONDITION_CHIPS.some((c) => c.value === cond)) {
      this.selectedCond.set(cond);
    }
  }

  @Output() readonly submitted = new EventEmitter<{
    payload: CreateListingRequest;
    files: File[];
    imageOrder: ListingImageOrderItem[] | null;
  }>();
  @Output() readonly cancelled = new EventEmitter<void>();
  @Output() readonly retryUpload = new EventEmitter<File[]>();

  ngOnInit(): void {
    // Category isn't part of the listing-update payload, so don't force a value
    // in edit mode — the owner may not have one and we never persist a change.
    if (this.mode === 'edit') {
      this.createListingForm.controls.categoryId.clearValidators();
      this.createListingForm.controls.categoryId.updateValueAndValidity();
    }
  }

  // ── Constants exposed to template ─────────────────────────────
  readonly minPrice = MIN_PRICE_PER_DAY;
  readonly minPhotos = MIN_PHOTOS;
  readonly maxPhotos = MAX_PHOTOS;
  readonly steps = WIZARD_STEPS;
  readonly yerevanCenter = YEREVAN_CENTER;

  // ── Wizard ───────────────────────────────────────────────────
  readonly currentStep = signal(1);
  readonly totalSteps = 5;
  readonly stepIndices = [1, 2, 3, 4, 5] as const;
  readonly progressPct = computed(() => (this.currentStep() / this.totalSteps) * 100);
  // Vertical desktop stepper fill: 0% at step 1 → 100% at the last step.
  readonly stepperFillPct = computed(
    () => ((this.currentStep() - 1) / (this.totalSteps - 1)) * 100,
  );

  // ── Chip data ─────────────────────────────────────────────────
  readonly conditionChips = CONDITION_CHIPS;
  readonly minRentalDays = MIN_RENTAL_DAYS;
  readonly priceUnits = PRICE_UNITS;

  // ── Chip / selection state ────────────────────────────────────
  // Minimum rental and delivery live in `createListingForm` — they are payload
  // fields, not view state.
  readonly selectedCond = signal<ConditionChip['value'] | null>(null);

  // ── Age range (years) ─────────────────────────────────────────
  readonly ageYears = signal<[number, number]>([2, 5]);
  readonly ageRangeText = computed(() => {
    const [lo, hi] = this.ageYears();
    return `${this.fmtAge(lo)}–${this.fmtAge(hi)}`;
  });

  // ── Safety state ──────────────────────────────────────────────
  readonly cleanWashed = signal(false);
  readonly cleanDisinfected = signal(false);
  readonly cleanUV = signal(false);
  /** Total cleaning steps offered — drives the "N of 3" summary row. */
  readonly cleaningStepsTotal = 3;
  readonly cleaningStepsDone = computed(
    () => [this.cleanWashed(), this.cleanDisinfected(), this.cleanUV()].filter(Boolean).length,
  );

  // ── Images ────────────────────────────────────────────────────
  selectedFiles: File[] = [];
  readonly imagePreviews = signal<string[]>([]);
  readonly photoError = signal<string | null>(null);
  readonly dragSrcIdx = signal<number | null>(null);
  readonly dragOverIdx = signal<number | null>(null);
  readonly coverDragOver = signal(false);
  readonly photoCount = computed(() => this.imagePreviews().length);
  readonly photosValid = computed(() => {
    if (this.mode === 'edit') {
      // The listing must keep at least one photo and stay within the cap.
      const n = this.editGallery().length;
      return n >= 1 && n <= MAX_PHOTOS;
    }
    const n = this.photoCount();
    return n >= MIN_PHOTOS && n <= MAX_PHOTOS;
  });
  // Create mode grid: indices 1..n-1 (first photo lives in the cover zone).
  // Edit mode renders its grid from `editGridItems` instead, so this stays empty.
  readonly gridIndices = computed(() =>
    this.mode === 'edit'
      ? []
      : Array.from({ length: Math.max(this.imagePreviews().length - 1, 0) }, (_, i) => i + 1),
  );
  // Edit mode grid: every gallery photo except the cover (index 0), carrying its
  // absolute gallery index so remove / set-cover / reorder act on the right item.
  readonly editGridItems = computed(() =>
    this.editGallery()
      .map((item, index) => ({ ...item, index }))
      .slice(1),
  );
  // Number of freshly picked photos in edit mode (drives the "added" hint).
  readonly newPhotoCount = computed(() => this.editGallery().filter((i) => i.file !== null).length);
  // Whether the grid has any non-cover photos (drives the drag-to-reorder hint).
  readonly hasGridPhotos = computed(() =>
    this.mode === 'edit' ? this.editGridItems().length > 0 : this.gridIndices().length > 0,
  );
  // Preview card image: the cover is the first gallery photo in edit mode.
  readonly coverImageUrl = computed(() =>
    this.mode === 'edit' ? (this.editGallery()[0]?.url ?? null) : (this.imagePreviews()[0] ?? null),
  );
  // Total photos that will exist after save.
  readonly displayPhotoCount = computed(() =>
    this.mode === 'edit' ? this.editGallery().length : this.imagePreviews().length,
  );
  // Decorative empty slots to round the desktop photo grid out to 4 cells.
  readonly fillerSlots = computed(() => {
    const gridItems =
      this.mode === 'edit'
        ? this.editGridItems().length
        : Math.max(this.imagePreviews().length - 1, 0);
    const gridUsed = gridItems + 1; // +1 for the add slot
    return Array.from({ length: Math.max(0, 4 - gridUsed) }, (_, i) => i);
  });

  // ── Form ──────────────────────────────────────────────────────
  readonly createListingForm = this.fb.group(
    {
      title: this.fb.nonNullable.control('', [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(200),
      ]),
      description: this.fb.nonNullable.control('', [
        Validators.required,
        Validators.minLength(20),
        Validators.maxLength(4000),
      ]),
      categoryId: this.fb.nonNullable.control('', [Validators.required]),
      pricePerDay: this.fb.control<number | null>(null, [
        Validators.required,
        Validators.min(MIN_PRICE_PER_DAY),
      ]),
      priceUnit: this.fb.nonNullable.control<PriceUnit>('Daily', [Validators.required]),
      city: this.fb.nonNullable.control('', [Validators.required]),
      addressLine: this.fb.nonNullable.control(''),
      latitude: this.fb.control<number | null>(null),
      longitude: this.fb.control<number | null>(null),
      // Optional owner override; the backend derives this from the pin when null.
      districtId: this.fb.control<string | null>(null),
      ageFromMonths: this.fb.control<number | null>(24, [Validators.min(0)]),
      ageToMonths: this.fb.control<number | null>(60, [Validators.min(0)]),
      condition: this.fb.nonNullable.control<'' | ConditionChip['value']>(''),
      hygieneNotes: this.fb.nonNullable.control(''),
      safetyNotes: this.fb.nonNullable.control(''),
      // Shortest bookable period in days; one of MIN_RENTAL_DAYS.
      minRentalDays: this.fb.nonNullable.control<number>(1),
      // Single-select: the toy is handed over one way or the other.
      deliveryType: this.fb.nonNullable.control<DeliveryType>('Pickup'),
    },
    { validators: ageRangeValidator },
  );

  // ── Navigation ────────────────────────────────────────────────
  goBack(): void {
    this.location.back();
  }

  goToNextStep(): void {
    const step = this.currentStep();
    if (step === 1 && !this.photosValid()) {
      this.photoError.set('listings.createForm.validation.photoTooFew');
      return;
    }
    const names = STEP_CONTROLS[step - 1] ?? [];
    names.forEach((n) => this.createListingForm.get(n)?.markAsTouched());
    const valid = names.every((n) => this.createListingForm.get(n)?.valid !== false);
    if (valid) {
      this.currentStep.update((s) => Math.min(s + 1, this.totalSteps));
      this.scrollToTop();
    }
  }

  goToPrevStep(): void {
    this.currentStep.update((s) => Math.max(s - 1, 1));
    this.scrollToTop();
  }

  jumpToStep(step: number): void {
    this.currentStep.set(step);
    this.scrollToTop();
  }

  private scrollToTop(): void {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Age slider ────────────────────────────────────────────────
  protected onAgeChange(value: [number, number]): void {
    this.ageYears.set(value);
    this.createListingForm.patchValue({
      ageFromMonths: value[0] * 12,
      ageToMonths: value[1] * 12,
    });
  }

  protected fmtAge(v: number): string {
    return v >= AGE_MAX_YEARS ? `${AGE_MAX_YEARS}+` : `${v}`;
  }

  // ── Pricing ───────────────────────────────────────────────────
  /** Open state for the custom "charge per" dropdown. */
  readonly unitMenuOpen = signal(false);

  protected selectedUnit(): PriceUnit {
    return this.createListingForm.controls.priceUnit.value;
  }

  protected toggleUnitMenu(): void {
    this.unitMenuOpen.update((o) => !o);
  }

  protected selectUnit(unit: PriceUnit): void {
    this.createListingForm.controls.priceUnit.setValue(unit);
    this.createListingForm.controls.priceUnit.markAsDirty();
    this.unitMenuOpen.set(false);
  }

  protected closeUnitMenu(): void {
    this.unitMenuOpen.set(false);
  }

  /** Single-letter badge for a unit row (H / D / W / M / Y). */
  protected priceUnitBadge(unit: PriceUnit): string {
    return unit.charAt(0);
  }

  /** Dropdown row label, e.g. "Per Day". */
  protected priceUnitOptionKey(unit: PriceUnit): string {
    return `listings.createForm.priceUnitOption.${unit.toLowerCase()}`;
  }

  protected priceUnitSuffixKey(): string {
    return `listings.createForm.perUnit.${this.createListingForm.controls.priceUnit.value.toLowerCase()}`;
  }

  protected priceUnitNounKey(unit: PriceUnit): string {
    return `listings.createForm.priceUnitNoun.${unit.toLowerCase()}`;
  }

  // ── Location pin picker ───────────────────────────────────────
  /** Trigger button — either the "Set location on map" CTA or the "Change"
   *  affordance on the static preview, whichever is currently rendered. Focus
   *  returns here when the full-screen picker closes (a11y requirement). */
  private readonly locationPickerTrigger =
    viewChild<ElementRef<HTMLButtonElement>>('locationPickerTrigger');

  readonly showLocationPicker = signal(false);

  /**
   * The confirmed pin, or null while none has been set — drives the
   * CTA-vs-preview switch in the template. Mirrors the (non-signal)
   * `latitude`/`longitude` form controls, same reasoning as `selectedCond` /
   * `ageYears` elsewhere in this component: a `computed()` can't react to
   * plain `FormControl.value` reads (no signal dependency to track), so this
   * has to be a signal set explicitly wherever those controls are written.
   */
  readonly pinCenter = signal<MapLatLng | null>(null);
  readonly hasPin = computed(() => this.pinCenter() !== null);

  /**
   * Flipped true right before the picker closes; the `afterRenderEffect` in
   * the constructor consumes it and flips it back. Confirm changes `hasPin()`
   * in the same tick as this flag, so both land in the same render pass —
   * by the time the effect runs, `locationPickerTrigger()` resolves to
   * whichever button (CTA or "change") is actually visible post-swap.
   */
  private readonly focusReturnPending = signal(false);

  protected openLocationPicker(): void {
    this.showLocationPicker.set(true);
  }

  protected onLocationConfirmed(coord: MapLatLng): void {
    this.createListingForm.patchValue({ latitude: coord.lat, longitude: coord.lng });
    this.createListingForm.controls.latitude.markAsDirty();
    this.createListingForm.controls.longitude.markAsDirty();
    this.pinCenter.set(coord);
    this.closeLocationPicker();
  }

  protected onLocationCancelled(): void {
    this.closeLocationPicker();
  }

  private closeLocationPicker(): void {
    this.showLocationPicker.set(false);
    // Return focus to whichever button occupies the trigger spot once the
    // DOM has caught up (a11y requirement) — see `focusReturnPending` above.
    this.focusReturnPending.set(true);
  }

  protected districtName(district: ListingDistrict): string {
    return districtDisplayName(district, this.languageService.current().code);
  }

  // ── Chip handlers ─────────────────────────────────────────────
  /**
   * Delivery is mutually exclusive (the control renders as a radio group), so
   * picking one replaces the other. There is no "neither" state — 'Pickup' is
   * the default.
   */
  selectDelivery(type: DeliveryType): void {
    this.createListingForm.controls.deliveryType.setValue(type);
    this.createListingForm.controls.deliveryType.markAsDirty();
  }

  protected selectedDelivery(): DeliveryType {
    return this.createListingForm.controls.deliveryType.value;
  }

  selectMinDays(days: number): void {
    this.createListingForm.controls.minRentalDays.setValue(days);
    this.createListingForm.controls.minRentalDays.markAsDirty();
  }

  protected selectedMinDays(): number {
    return this.createListingForm.controls.minRentalDays.value;
  }

  /**
   * Reuses the chip labels ("3 days", "1 week") for the preview's "min …" line,
   * which keeps plural forms and word order correct in every locale without a
   * plural-aware key.
   */
  protected minRentalLabelKey(): string {
    return `listings.createForm.minRental.d${this.selectedMinDays()}`;
  }

  protected onCategoryChange(id: string | null): void {
    this.createListingForm.controls.categoryId.setValue(id ?? '');
    this.createListingForm.controls.categoryId.markAsTouched();
  }

  selectCond(chip: ConditionChip): void {
    if (this.selectedCond() === chip.value) {
      this.selectedCond.set(null);
      this.createListingForm.patchValue({ condition: '' });
    } else {
      this.selectedCond.set(chip.value);
      this.createListingForm.patchValue({ condition: chip.value });
    }
  }

  // ── Images ────────────────────────────────────────────────────

  // Cover area: multi-select that replaces all current selections
  protected onImagesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;
    const accepted = this.acceptFiles(Array.from(input.files), true);
    input.value = '';
    if (accepted.length === 0) return;
    this.selectedFiles = accepted;
    this.readPreviews(accepted, 0, true);
  }

  // Strip add button: appends files without replacing existing ones
  protected onStripImagesAdded(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    this.appendFiles(Array.from(input.files));
    input.value = '';
  }

  // Individual slot: appends one file
  protected onSlotImageAdded(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    this.appendFiles([input.files[0]]);
    input.value = '';
  }

  // Remove one photo by index
  protected removePhoto(index: number): void {
    this.selectedFiles = [
      ...this.selectedFiles.slice(0, index),
      ...this.selectedFiles.slice(index + 1),
    ];
    this.imagePreviews.update((prev) => prev.filter((_, i) => i !== index));
    if (this.photosValid()) this.photoError.set(null);
  }

  // Edit mode: remove one gallery photo (existing or newly added) by index.
  protected removeGalleryItem(index: number): void {
    this.editGallery.update((g) => g.filter((_, i) => i !== index));
    if (this.photosValid()) this.photoError.set(null);
  }

  // Edit mode: promote any gallery photo to cover (index 0).
  protected setGalleryCover(index: number): void {
    if (index <= 0) return;
    this.editGallery.update((g) => {
      const copy = [...g];
      const [item] = copy.splice(index, 1);
      return [item, ...copy];
    });
  }

  // Edit mode: move a gallery photo from one position to another.
  private reorderGallery(from: number, to: number): void {
    this.editGallery.update((g) => {
      const copy = [...g];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  }

  // Edit mode: discard the freshly picked photos and keep the existing ones.
  protected clearNewImages(): void {
    this.editGallery.update((g) => g.filter((i) => i.existingId !== null));
    this.photoError.set(null);
    this.dragSrcIdx.set(null);
    this.dragOverIdx.set(null);
  }

  // ── Cover zone DnD (OS file drops + internal image drops to set as cover) ──
  protected onCoverDragOver(event: DragEvent): void {
    event.preventDefault();
    this.coverDragOver.set(true);
  }

  protected onCoverDragLeave(): void {
    this.coverDragOver.set(false);
  }

  protected onCoverDrop(event: DragEvent): void {
    event.preventDefault();
    this.coverDragOver.set(false);
    const srcStr = event.dataTransfer?.getData('text/x-photo-index');
    if (srcStr) {
      const src = parseInt(srcStr, 10);
      if (!isNaN(src) && src > 0) {
        if (this.mode === 'edit') this.setGalleryCover(src);
        else this.reorder(src, 0);
      }
      return;
    }
    const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
      f.type.startsWith('image/'),
    );
    if (files.length) this.appendFiles(files);
  }

  // ── Grid slot DnD (drag to reorder) ──────────────────────────
  protected onSlotDragStart(event: DragEvent, index: number): void {
    this.dragSrcIdx.set(index);
    event.dataTransfer?.setData('text/x-photo-index', String(index));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  protected onSlotDragOver(event: DragEvent, index: number): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverIdx.set(index);
  }

  protected onSlotDrop(event: DragEvent, targetIdx: number): void {
    event.preventDefault();
    const srcIdx = this.dragSrcIdx();
    if (srcIdx !== null && srcIdx !== targetIdx) {
      if (this.mode === 'edit') this.reorderGallery(srcIdx, targetIdx);
      else this.reorder(srcIdx, targetIdx);
    }
    this.dragSrcIdx.set(null);
    this.dragOverIdx.set(null);
  }

  protected onSlotDragEnd(): void {
    this.dragSrcIdx.set(null);
    this.dragOverIdx.set(null);
  }

  // Promote any image to cover position (index 0)
  protected setCoverImage(index: number): void {
    if (index > 0) this.reorder(index, 0);
  }

  private reorder(from: number, to: number): void {
    const files = [...this.selectedFiles];
    const [movedFile] = files.splice(from, 1);
    files.splice(to, 0, movedFile);
    this.selectedFiles = files;

    const previews = [...this.imagePreviews()];
    const [movedPreview] = previews.splice(from, 1);
    previews.splice(to, 0, movedPreview);
    this.imagePreviews.set(previews);
  }

  private appendFiles(newFiles: File[]): void {
    const accepted = this.acceptFiles(newFiles, false);
    if (accepted.length === 0) return;
    // Edit mode: append each new photo to the end of the unified gallery so it
    // behaves like any other photo (reorderable, removable, promotable to cover).
    if (this.mode === 'edit') {
      accepted.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const url = e.target?.result as string;
          this.editGallery.update((g) => [...g, { url, existingId: null, file }]);
        };
        reader.readAsDataURL(file);
      });
      if (this.photosValid()) this.photoError.set(null);
      return;
    }
    const startIdx = this.selectedFiles.length;
    this.selectedFiles = [...this.selectedFiles, ...accepted];
    this.readPreviews(accepted, startIdx, false);
  }

  /** Validates type/size/count, sets photoError, returns the accepted files. */
  private acceptFiles(incoming: File[], replacing: boolean): File[] {
    const baseCount =
      this.mode === 'edit' ? this.editGallery().length : replacing ? 0 : this.selectedFiles.length;
    const accepted: File[] = [];
    let typeError = false;
    let sizeError = false;
    let maxError = false;
    for (const file of incoming) {
      if (!file.type.startsWith('image/')) {
        typeError = true;
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        sizeError = true;
        continue;
      }
      if (baseCount + accepted.length >= MAX_PHOTOS) {
        maxError = true;
        continue;
      }
      accepted.push(file);
    }
    if (typeError) this.photoError.set('listings.createForm.validation.photoWrongType');
    else if (sizeError) this.photoError.set('listings.createForm.validation.photoTooLarge');
    else if (maxError) this.photoError.set('listings.createForm.validation.photoTooMany');
    else this.photoError.set(null);
    return accepted;
  }

  private readPreviews(files: File[], startIdx: number, replace: boolean): void {
    const previews = replace ? new Array<string>(files.length) : [...this.imagePreviews()];
    let done = 0;
    files.forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        previews[startIdx + i] = e.target?.result as string;
        if (++done === files.length) this.imagePreviews.set([...previews]);
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────
  protected getCategoryName(): string {
    const id = this.createListingForm.controls.categoryId.value;
    return this.categories.find((c) => c.id === id)?.name ?? id;
  }

  protected getPickupSummary(): string {
    const area = this.createListingForm.controls.addressLine.value.trim();
    const city = this.createListingForm.controls.city.value.trim();
    if (area && city) return `${area}, ${city}`;
    return area || city || '—';
  }

  protected getDeliverySummaryKey(): string {
    return this.selectedDelivery() === 'Pickup'
      ? 'listings.createForm.delivery.pickupShort'
      : 'listings.createForm.delivery.deliverShort';
  }

  protected getStepNameKey(): string {
    return this.steps[this.currentStep() - 1]?.labelKey ?? '';
  }

  /** Short label of the PREVIOUS step, for the desktop Back button's two-line
   *  stack (small "Back" caption over the step it returns to). Empty before
   *  step 1 exists — the template only renders this line when `currentStep() > 1`. */
  protected prevStepShortKey(): string {
    return this.steps[this.currentStep() - 2]?.shortLabelKey ?? '';
  }

  /** Short label of the NEXT step, for the desktop Next button's two-line
   *  stack (small "Next" caption over the step it advances to). Only read on
   *  steps 1–4 — the last step renders the single-line Submit button instead. */
  protected nextStepShortKey(): string {
    return this.steps[this.currentStep()]?.shortLabelKey ?? '';
  }

  protected getContinueLabelKey(): string {
    const keys = [
      'listings.createPage.wizard.continueToBasics',
      'listings.createPage.wizard.continueToPricing',
      'listings.createPage.wizard.continueToSafety',
      'listings.createPage.wizard.continueToPreview',
    ];
    return keys[this.currentStep() - 1] ?? 'listings.createPage.wizard.continue';
  }

  protected noteLength(): number {
    return this.createListingForm.controls.safetyNotes.value.length;
  }

  protected hasError(controlName: keyof typeof this.createListingForm.controls): boolean {
    const ctrl = this.createListingForm.controls[controlName];
    return ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  protected titleErrorKey(): string {
    const ctrl = this.createListingForm.controls.title;
    if (ctrl.hasError('required')) return 'listings.createForm.validation.required';
    if (ctrl.hasError('minlength')) return 'listings.createForm.validation.titleTooShort';
    return 'listings.createForm.validation.titleTooLong';
  }

  protected canSubmit(): boolean {
    return this.createListingForm.valid && this.photosValid() && !this.isSubmitting;
  }

  // ── Submit ────────────────────────────────────────────────────
  protected onSubmit(): void {
    if (this.createListingForm.invalid || !this.photosValid()) {
      this.createListingForm.markAllAsTouched();
      if (!this.photosValid()) {
        this.photoError.set('listings.createForm.validation.photoTooFew');
      }
      return;
    }
    const raw = this.createListingForm.getRawValue();
    if (raw.pricePerDay === null) return;

    const checks: string[] = [];
    if (this.cleanWashed()) checks.push('Washed with soap & water');
    if (this.cleanDisinfected()) checks.push('Disinfected with safe wipes');
    if (this.cleanUV()) checks.push('UV-sanitized');
    const rawHygiene = raw.hygieneNotes.trim();
    const hygieneNotes = checks.length
      ? rawHygiene
        ? `${checks.join(', ')}. ${rawHygiene}`
        : checks.join(', ')
      : rawHygiene || null;

    const payload: CreateListingRequest = {
      title: raw.title.trim(),
      description: raw.description.trim(),
      categoryId: raw.categoryId.trim(),
      pricePerDay: raw.pricePerDay,
      priceUnit: raw.priceUnit,
      country: DEFAULT_COUNTRY,
      city: raw.city.trim(),
      addressLine: this.toNullStr(raw.addressLine),
      latitude: raw.latitude,
      longitude: raw.longitude,
      districtId: raw.districtId,
      ageFromMonths: raw.ageFromMonths,
      ageToMonths: raw.ageToMonths,
      condition: raw.condition === '' ? null : raw.condition,
      hygieneNotes,
      safetyNotes: this.toNullStr(raw.safetyNotes),
      minRentalDays: raw.minRentalDays,
      deliveryType: raw.deliveryType,
    };

    if (this.mode === 'edit') {
      // Walk the gallery once, keeping only real photos (existing id or a file).
      // New photos get a sequential index into the emitted files array so the
      // page can swap in their server ids after upload and reorder the full set.
      const emittable = this.editGallery().filter((i) => i.existingId !== null || i.file !== null);
      const files = emittable.filter((i) => i.file !== null).map((i) => i.file!);
      let newFileIndex = 0;
      const imageOrder: ListingImageOrderItem[] = emittable.map((i) =>
        i.existingId !== null
          ? { existingId: i.existingId, newFileIndex: null }
          : { existingId: null, newFileIndex: newFileIndex++ },
      );
      this.submitted.emit({ payload, files, imageOrder });
      return;
    }
    this.submitted.emit({ payload, files: this.selectedFiles, imageOrder: null });
  }

  // ── Retry image upload (re-emitted to the page) ───────────────
  protected onRetryUpload(): void {
    this.retryUpload.emit(this.selectedFiles);
  }

  private toNullStr(v: string): string | null {
    const s = v.trim();
    return s === '' ? null : s;
  }
}
