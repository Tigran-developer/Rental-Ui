import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';

import { makeAdminCategory } from '../../../../../testing/fixtures';
import { CategoryDeleteDialogComponent } from './category-delete-dialog.component';

describe('CategoryDeleteDialogComponent', () => {
  let fixture: ComponentFixture<CategoryDeleteDialogComponent>;
  let trigger: HTMLButtonElement;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function confirmBtn(): HTMLButtonElement {
    return host().querySelector<HTMLButtonElement>('.category-delete-dialog__btn--confirm')!;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoryDeleteDialogComponent],
      providers: [provideTranslateService({ lang: 'en', fallbackLang: 'en' })],
    }).compileComponents();

    trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    fixture = TestBed.createComponent(CategoryDeleteDialogComponent);
  });

  afterEach(() => {
    trigger.remove();
  });

  function setInputs(overrides: {
    categoryName?: string;
    listingCount?: number;
    otherCategories?: ReturnType<typeof makeAdminCategory>[];
    isDesktop?: boolean;
  }): void {
    fixture.componentRef.setInput('categoryName', overrides.categoryName ?? 'Ride-ons');
    fixture.componentRef.setInput('listingCount', overrides.listingCount ?? 0);
    fixture.componentRef.setInput('otherCategories', overrides.otherCategories ?? []);
    fixture.componentRef.setInput('isDesktop', overrides.isDesktop ?? true);
    fixture.detectChanges();
  }

  describe('no listings', () => {
    it('the confirm button starts enabled and emits confirmSimple', () => {
      setInputs({ listingCount: 0 });
      expect(confirmBtn().disabled).toBe(false);

      const emitted: void[] = [];
      fixture.componentInstance.confirmSimple.subscribe(() => emitted.push(undefined));
      confirmBtn().click();
      expect(emitted.length).toBe(1);
    });
  });

  describe('required-target guard (has listings)', () => {
    it('disables confirm until a reassign target is chosen', () => {
      setInputs({
        listingCount: 3,
        otherCategories: [makeAdminCategory({ id: 'c2', name: 'Wooden' })],
      });
      expect(confirmBtn().disabled).toBe(true);

      const select = host().querySelector<HTMLSelectElement>('.category-delete-dialog__select')!;
      select.value = 'c2';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(confirmBtn().disabled).toBe(false);
    });

    it('emits confirmExisting with the chosen target id', () => {
      setInputs({
        listingCount: 3,
        otherCategories: [makeAdminCategory({ id: 'c2', name: 'Wooden' })],
      });
      const select = host().querySelector<HTMLSelectElement>('.category-delete-dialog__select')!;
      select.value = 'c2';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      const emitted: string[] = [];
      fixture.componentInstance.confirmExisting.subscribe((id) => emitted.push(id));
      confirmBtn().click();
      expect(emitted).toEqual(['c2']);
    });

    it('keeps confirm disabled for "+ Move to a new category…" until a name is typed', () => {
      setInputs({ listingCount: 2, otherCategories: [] });
      const select = host().querySelector<HTMLSelectElement>('.category-delete-dialog__select')!;
      select.value = '__new__';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(confirmBtn().disabled).toBe(true);

      const input = host().querySelector<HTMLInputElement>('.category-delete-dialog__input')!;
      input.value = 'Brand New';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(confirmBtn().disabled).toBe(false);

      const emitted: string[] = [];
      fixture.componentInstance.confirmNew.subscribe((name) => emitted.push(name));
      confirmBtn().click();
      expect(emitted).toEqual(['Brand New']);
    });

    it('re-disables confirm if the new-category name is only whitespace', () => {
      setInputs({ listingCount: 2, otherCategories: [] });
      const select = host().querySelector<HTMLSelectElement>('.category-delete-dialog__select')!;
      select.value = '__new__';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      const input = host().querySelector<HTMLInputElement>('.category-delete-dialog__input')!;
      input.value = '   ';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(confirmBtn().disabled).toBe(true);
    });
  });

  it('never emits confirm while busy', () => {
    setInputs({ listingCount: 3, otherCategories: [makeAdminCategory({ id: 'c2' })] });
    fixture.componentRef.setInput('busy', true);
    const select = host().querySelector<HTMLSelectElement>('.category-delete-dialog__select')!;
    select.value = 'c2';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(confirmBtn().disabled).toBe(true);
  });

  it('restores focus to the previously-focused element on destroy', () => {
    setInputs({ listingCount: 0 });
    fixture.destroy();
    expect(document.activeElement).toBe(trigger);
  });
});
