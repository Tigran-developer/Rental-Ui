import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';

import type { ListingCategoryOption } from '../../../listings/models/create-listing.model';
import { AdminCatSelectComponent } from './admin-cat-select.component';

function makeCategory(overrides: Partial<ListingCategoryOption> = {}): ListingCategoryOption {
  return { id: 'cat-1', name: 'Wooden Toys', slug: 'wooden-toys', ...overrides };
}

describe('AdminCatSelectComponent', () => {
  let fixture: ComponentFixture<AdminCatSelectComponent>;

  // `ComponentFixture.nativeElement` is typed `any` by Angular, and TS
  // rejects explicit type arguments on calls through an `any`-typed
  // expression — routing through a typed local fixes that (matches the
  // established idiom elsewhere in this repo, e.g. `dorent-symbol`,
  // `language-selector`, `chat` specs).
  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminCatSelectComponent],
      providers: [provideTranslateService({ lang: 'en', fallbackLang: 'en' })],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminCatSelectComponent);
  });

  function setInputs(overrides: {
    categories?: ListingCategoryOption[];
    value?: string | null;
  }): void {
    fixture.componentRef.setInput('categories', overrides.categories ?? [makeCategory()]);
    fixture.componentRef.setInput('value', overrides.value ?? null);
    fixture.detectChanges();
  }

  it('shows the selected category name', () => {
    setInputs({ categories: [makeCategory({ id: 'c1', name: 'Ride-ons' })], value: 'c1' });
    const trigger: HTMLElement = fixture.nativeElement.querySelector('.admin-cat-select__trigger');
    expect(trigger.textContent).toContain('Ride-ons');
  });

  it('opens the panel on trigger click and lists every category', () => {
    setInputs({
      categories: [
        makeCategory({ id: 'c1', name: 'Ride-ons' }),
        makeCategory({ id: 'c2', name: 'Plush' }),
      ],
    });
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.admin-cat-select__trigger',
    );
    trigger.click();
    fixture.detectChanges();

    const options = fixture.nativeElement.querySelectorAll('.admin-cat-select__option');
    expect(options.length).toBe(2);
  });

  it('emits valueChange with the categoryId and categoryName on selection, and closes the panel', () => {
    setInputs({
      categories: [
        makeCategory({ id: 'c1', name: 'Ride-ons' }),
        makeCategory({ id: 'c2', name: 'Plush' }),
      ],
      value: 'c1',
    });
    const emitted: { categoryId: string; categoryName: string }[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));

    host().querySelector<HTMLButtonElement>('.admin-cat-select__trigger')?.click();
    fixture.detectChanges();
    const options = host().querySelectorAll<HTMLButtonElement>('.admin-cat-select__option');
    options[1].click();
    fixture.detectChanges();

    expect(emitted).toEqual([{ categoryId: 'c2', categoryName: 'Plush' }]);
    expect(host().querySelector('.admin-cat-select__panel')).toBeNull();
  });

  it('does not emit when re-selecting the already-active category', () => {
    setInputs({ categories: [makeCategory({ id: 'c1', name: 'Ride-ons' })], value: 'c1' });
    const emitted: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));

    host().querySelector<HTMLButtonElement>('.admin-cat-select__trigger')?.click();
    fixture.detectChanges();
    host().querySelector<HTMLButtonElement>('.admin-cat-select__option')?.click();

    expect(emitted).toEqual([]);
  });

  it('closes when clicking outside the component', () => {
    setInputs({ categories: [makeCategory()] });
    host().querySelector<HTMLButtonElement>('.admin-cat-select__trigger')?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.admin-cat-select__panel')).not.toBeNull();

    document.body.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.admin-cat-select__panel')).toBeNull();
  });

  it('restores focus to the trigger after a keyboard selection, instead of dropping it', () => {
    setInputs({
      categories: [
        makeCategory({ id: 'c1', name: 'Ride-ons' }),
        makeCategory({ id: 'c2', name: 'Plush' }),
      ],
      value: 'c1',
    });
    const trigger = host().querySelector<HTMLButtonElement>('.admin-cat-select__trigger')!;
    trigger.click();
    fixture.detectChanges();

    const secondOption = host().querySelectorAll<HTMLButtonElement>('.admin-cat-select__option')[1];
    secondOption.focus();
    expect(document.activeElement).toBe(secondOption);

    secondOption.click();
    fixture.detectChanges();

    expect(document.activeElement).toBe(trigger);
  });

  it('restores focus to the trigger on Escape when focus was inside the panel', () => {
    setInputs({ categories: [makeCategory({ id: 'c1' }), makeCategory({ id: 'c2' })] });
    const trigger = host().querySelector<HTMLButtonElement>('.admin-cat-select__trigger')!;
    trigger.click();
    fixture.detectChanges();

    const firstOption = host().querySelector<HTMLButtonElement>('.admin-cat-select__option')!;
    firstOption.focus();
    expect(document.activeElement).toBe(firstOption);

    host().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(trigger);
  });

  it('does not open when disabled', () => {
    fixture.componentRef.setInput('categories', [makeCategory()]);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    host().querySelector<HTMLButtonElement>('.admin-cat-select__trigger')?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.admin-cat-select__panel')).toBeNull();
  });
});
