import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';

import { CreateListingFormComponent } from './create-listing-form.component';
import type {
  ListingFormMode,
  ListingImageOrderItem,
} from './create-listing-form.component';
import { LocationPickerComponent } from '../location-picker/location-picker.component';
import type { CreateListingRequest } from '../../models/create-listing.model';
import type { ListingDistrict } from '../../models/district.model';
import type { MapLatLng } from '../../../../shared/ui/map/map.component';

/**
 * The focus-return regression tests below advance the wizard to Step 3, which
 * renders `<app-map>` for the confirmed-pin preview (see `hasPin()` branch in
 * the template) — a real `import('leaflet')` in `ngAfterViewInit`. Stubbed the
 * same way `location-picker.component.spec.ts` does, since these tests only
 * care about focus/DOM wiring, not Leaflet's own rendering.
 */
vi.mock('leaflet', () => ({
  map: vi.fn((_el: HTMLElement, options: { center: [number, number] }) => ({
    setView: vi.fn(),
    on: vi.fn(),
    getCenter: vi.fn(() => ({ lat: options.center[0], lng: options.center[1] })),
    invalidateSize: vi.fn(),
    removeLayer: vi.fn(),
    remove: vi.fn(),
  })),
  tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
  marker: vi.fn(() => ({ addTo: vi.fn() })),
  divIcon: vi.fn((options: unknown) => options),
}));

/**
 * Regression net for the create-listing wizard's Step-3 payload (confirmed
 * data-loss bug, fixed 2026-07-17).
 *
 * The wizard collects a minimum rental period and a delivery method, but
 * `onSubmit()` used to build `CreateListingRequest` WITHOUT them: both values
 * were silently dropped at submit and never reached the API. These tests pin the
 * contract that matters — the emitted `submitted` payload MUST carry:
 *   - `minRentalDays` as the chosen day-count NUMBER, and
 *   - `deliveryType` as the STRING union 'Pickup' | 'Courier' (never a number,
 *     never a Set — the API serializes the enum from a string via its global
 *     JsonStringEnumConverter).
 *
 * This is the cheapest reliable layer for a payload-construction bug: it targets
 * `onSubmit()` directly, needs no browser/DB, and would have gone red the moment
 * the fields were dropped.
 */

type SubmitEvent = {
  payload: CreateListingRequest;
  files: File[];
  imageOrder: ListingImageOrderItem[] | null;
};

/** Access the protected submit handler without loosening component visibility. */
interface Submittable {
  onSubmit(): void;
}

function createComponent(mode: ListingFormMode = 'create') {
  TestBed.configureTestingModule({
    imports: [CreateListingFormComponent, TranslateModule.forRoot()],
    providers: [provideMockStore()],
  });
  const fixture = TestBed.createComponent(CreateListingFormComponent);
  const component = fixture.componentInstance;
  // Set the mode BEFORE the first change detection so `ngOnInit` runs with it
  // (edit mode drops the category validator there).
  component.mode = mode;
  fixture.detectChanges();
  return { fixture, component };
}

/** Fills every control the submit guard requires so `onSubmit()` proceeds. */
function fillValidBasics(component: CreateListingFormComponent): void {
  component.createListingForm.patchValue({
    title: 'Wooden Train Set',
    description: 'A lovely wooden train set in great condition for toddlers.',
    categoryId: 'cat-123',
    pricePerDay: 9,
    city: 'Yerevan',
  });
}

/** Create mode gates submit on >= 3 photo previews; seed them directly. */
function seedThreePhotos(component: CreateListingFormComponent): void {
  component.selectedFiles = [
    new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
    new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
    new File(['c'], 'c.jpg', { type: 'image/jpeg' }),
  ];
  component.imagePreviews.set(['data:a', 'data:b', 'data:c']);
}

/** Subscribes and calls the protected submit handler, returning the emission. */
function submitAndCapture(component: CreateListingFormComponent): SubmitEvent | null {
  let captured: SubmitEvent | null = null;
  const sub = component.submitted.subscribe((e) => (captured = e));
  (component as unknown as Submittable).onSubmit();
  sub.unsubscribe();
  return captured;
}

describe('CreateListingFormComponent — Step-3 payload (min rental + delivery)', () => {
  it('includes the chosen minRentalDays and deliveryType in the create payload', () => {
    const { component } = createComponent('create');
    fillValidBasics(component);
    seedThreePhotos(component);

    // Owner picks a 7-day minimum and courier delivery on Step 3.
    component.selectMinDays(7);
    component.selectDelivery('Courier');

    const event = submitAndCapture(component);

    expect(event).not.toBeNull();
    const payload = event!.payload;

    // The regression: these two used to be absent from the payload entirely.
    expect(payload.minRentalDays).toBe(7);
    expect(payload.deliveryType).toBe('Courier');

    // Type discipline — deliveryType is the STRING union, never a number or Set.
    expect(typeof payload.minRentalDays).toBe('number');
    expect(typeof payload.deliveryType).toBe('string');
    expect((payload.deliveryType as unknown) instanceof Set).toBe(false);
  });

  it('carries the wizard defaults (1 day / Pickup) when the owner leaves Step 3 untouched', () => {
    const { component } = createComponent('create');
    fillValidBasics(component);
    seedThreePhotos(component);

    // No selectMinDays / selectDelivery calls: defaults must still be emitted,
    // not dropped (the bug emitted neither field regardless of selection).
    const event = submitAndCapture(component);

    expect(event).not.toBeNull();
    expect(event!.payload.minRentalDays).toBe(1);
    expect(event!.payload.deliveryType).toBe('Pickup');
  });

  it('round-trips both fields back out in edit mode from a prefilled listing', () => {
    const { component } = createComponent('edit');
    // Edit mode gates submit on the gallery keeping >= 1 photo.
    component.existingImageUrls = [{ id: 'img-1', url: 'https://x/img-1.jpg' } as never];
    component.prefill = {
      title: 'Wooden Train Set',
      description: 'A lovely wooden train set in great condition for toddlers.',
      categoryId: 'cat-123',
      pricePerDay: 9,
      priceUnit: 'Daily',
      city: 'Yerevan',
      ageFromMonths: 24,
      ageToMonths: 60,
      condition: 'Good',
      hygieneNotes: null,
      safetyNotes: null,
      minRentalDays: 14,
      deliveryType: 'Courier',
    };

    const event = submitAndCapture(component);

    expect(event).not.toBeNull();
    expect(event!.payload.minRentalDays).toBe(14);
    expect(event!.payload.deliveryType).toBe('Courier');
    // Edit mode emits an image order; sanity-check the field survived alongside it.
    expect(event!.imageOrder).not.toBeNull();
  });

  it('falls back to 1 day / Pickup when editing a legacy listing that predates the fields', () => {
    const { component } = createComponent('edit');
    component.existingImageUrls = [{ id: 'img-1', url: 'https://x/img-1.jpg' } as never];
    // Listings created before these columns existed come back with null.
    component.prefill = {
      title: 'Legacy Listing',
      description: 'An older listing created before min-rental and delivery existed.',
      categoryId: 'cat-123',
      pricePerDay: 5,
      priceUnit: 'Daily',
      city: 'Yerevan',
      ageFromMonths: 24,
      ageToMonths: 60,
      condition: null,
      hygieneNotes: null,
      safetyNotes: null,
      minRentalDays: null,
      deliveryType: null,
    };

    const event = submitAndCapture(component);

    expect(event).not.toBeNull();
    // Must not emit null (which would re-introduce a different data-loss shape).
    expect(event!.payload.minRentalDays).toBe(1);
    expect(event!.payload.deliveryType).toBe('Pickup');
  });
});

/**
 * P1-6: the full-screen pin picker writes into the existing (previously
 * dead) `latitude`/`longitude` controls, and the optional district override
 * rides along in the same payload. `onLocationConfirmed` is exercised
 * directly here (bypassing the picker's own UI, which is unit-tested in
 * `location-picker.component.spec.ts`) so this stays a fast, DOM-free test of
 * the wiring between the two components.
 */
interface LocationWireable {
  onLocationConfirmed(coord: MapLatLng): void;
  pinCenter(): MapLatLng | null;
  hasPin(): boolean;
  showLocationPicker: { set(v: boolean): void };
}

const SAMPLE_DISTRICT: ListingDistrict = {
  id: 'd1111111-1111-1111-1111-111111111111',
  code: 'kentron',
  nameEn: 'Kentron',
  nameHy: 'Կենտրոն',
  nameRu: 'Кентрон',
};

describe('CreateListingFormComponent — pin picker → payload (P1-6)', () => {
  it('confirming the picker populates the latitude/longitude form controls', () => {
    const { component } = createComponent('create');
    const wireable = component as unknown as LocationWireable;

    expect(wireable.hasPin()).toBe(false);
    expect(component.createListingForm.controls.latitude.value).toBeNull();
    expect(component.createListingForm.controls.longitude.value).toBeNull();

    wireable.onLocationConfirmed({ lat: 40.1776, lng: 44.5126 });

    expect(component.createListingForm.controls.latitude.value).toBe(40.1776);
    expect(component.createListingForm.controls.longitude.value).toBe(44.5126);
    expect(wireable.hasPin()).toBe(true);
    expect(wireable.pinCenter()).toEqual({ lat: 40.1776, lng: 44.5126 });
  });

  it('carries latitude/longitude/districtId in the create payload once set', () => {
    const { component } = createComponent('create');
    fillValidBasics(component);
    seedThreePhotos(component);

    (component as unknown as LocationWireable).onLocationConfirmed({ lat: 40.19, lng: 44.51 });
    component.createListingForm.controls.districtId.setValue(SAMPLE_DISTRICT.id);

    const event = submitAndCapture(component);

    expect(event).not.toBeNull();
    expect(event!.payload.latitude).toBe(40.19);
    expect(event!.payload.longitude).toBe(44.51);
    expect(event!.payload.districtId).toBe(SAMPLE_DISTRICT.id);
  });

  it('still submits with null latitude/longitude/districtId when the owner never opens the picker (the pin stays optional)', () => {
    const { component } = createComponent('create');
    fillValidBasics(component);
    seedThreePhotos(component);

    const event = submitAndCapture(component);

    expect(event).not.toBeNull();
    expect(event!.payload.latitude).toBeNull();
    expect(event!.payload.longitude).toBeNull();
    expect(event!.payload.districtId).toBeNull();
  });
});

/**
 * a11y regression (verifier-confirmed, P1-6): closing the location picker via
 * Confirm left `document.activeElement` on `<body>` forever, because
 * `onLocationConfirmed` flips `hasPin()` — which swaps the template's
 * `@if/@else` between `.location-card__cta` and `.location-card__change-btn`
 * — in the SAME tick as the old `queueMicrotask`-based focus call. The
 * microtask ran before Angular re-rendered the swap, so it focused the
 * outgoing (about-to-be-destroyed) CTA node; the instant that node was
 * removed, focus reverted to `<body>`. Cancel/Escape never touch `hasPin()`,
 * so the trigger node never gets swapped out from under them — that's why
 * only the Confirm path was broken.
 *
 * The fix moves the focus call into an `afterRenderEffect` (the same
 * post-render primitive `conversation-details-page.component.ts` uses to
 * scroll after new messages render), gated by a `focusReturnPending` flag set
 * right before the picker closes. These tests render the real Step-3 DOM
 * (not the direct-method-call style used by the P1-6 payload tests above) so
 * they exercise the actual `@if/@else` swap and query `document.activeElement`
 * the same way the verifier's manual repro did.
 */
describe('CreateListingFormComponent — location picker focus return (a11y)', () => {
  function goToStep3(fixture: ReturnType<typeof createComponent>['fixture'], component: CreateListingFormComponent) {
    component.currentStep.set(3);
    fixture.detectChanges();
  }

  it('Confirm: focus lands on the "change" button once the CTA→change-button swap has rendered (regression)', async () => {
    const { fixture, component } = createComponent('create');
    goToStep3(fixture, component);

    const cta = fixture.nativeElement.querySelector('.location-card__cta') as HTMLButtonElement;
    expect(cta).toBeTruthy();
    cta.focus();
    expect(document.activeElement).toBe(cta);

    (component as unknown as LocationWireable).onLocationConfirmed({ lat: 40.1776, lng: 44.5126 });
    // Let a microtask-scheduled callback registered synchronously during the
    // call above (the old buggy fix used `queueMicrotask`) run BEFORE Angular
    // re-renders — reproducing the actual race the verifier hit, rather than
    // masking it by rendering first.
    await Promise.resolve();
    fixture.detectChanges();
    await fixture.whenStable();

    const changeBtn = fixture.nativeElement.querySelector('.location-card__change-btn') as HTMLButtonElement;
    expect(changeBtn).toBeTruthy();
    // The old CTA node must actually be gone (the `@else` branch un-rendered) —
    // otherwise this test wouldn't be exercising the swap at all.
    expect(fixture.nativeElement.querySelector('.location-card__cta')).toBeNull();
    expect(document.activeElement).toBe(changeBtn);
  });

  it('Cancel: focus returns to the CTA button (same node persists — no template swap)', async () => {
    const { fixture, component } = createComponent('create');
    goToStep3(fixture, component);

    const cta = fixture.nativeElement.querySelector('.location-card__cta') as HTMLButtonElement;
    cta.focus();
    expect(document.activeElement).toBe(cta);

    (component as unknown as { onLocationCancelled(): void }).onLocationCancelled();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.location-card__cta'));
  });

  it('Escape: the picker maps it to the same cancel path (PrimeNG dialog visibleChange(false)), which returns focus to the CTA button', async () => {
    const { fixture, component } = createComponent('create');
    goToStep3(fixture, component);

    const cta = fixture.nativeElement.querySelector('.location-card__cta') as HTMLButtonElement;
    cta.focus();
    expect(document.activeElement).toBe(cta);

    // Drive the REAL child component's Escape-equivalent handler (verified in
    // `location-picker.component.spec.ts` to be what Escape/the header close
    // button trigger) so this exercises the actual `(cancelled)` output
    // binding between the two components, not just the parent's own handler.
    const picker = fixture.debugElement.query(By.directive(LocationPickerComponent))
      .componentInstance as unknown as { onVisibleChange(visible: boolean): void };
    picker.onVisibleChange(false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.location-card__cta'));
  });
});
