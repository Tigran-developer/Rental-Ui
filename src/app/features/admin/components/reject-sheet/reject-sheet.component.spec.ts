import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';

import { REJECT_REASONS } from '../../models/reject-reason.model';
import { RejectSheetComponent } from './reject-sheet.component';

describe('RejectSheetComponent', () => {
  let fixture: ComponentFixture<RejectSheetComponent>;
  let trigger: HTMLButtonElement;

  // `ComponentFixture.nativeElement` is typed `any` by Angular, and TS
  // rejects explicit type arguments on calls through an `any`-typed
  // expression — routing through a typed local fixes that.
  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RejectSheetComponent],
      providers: [provideTranslateService({ lang: 'en', fallbackLang: 'en' })],
    }).compileComponents();

    trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    fixture = TestBed.createComponent(RejectSheetComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    trigger.remove();
  });

  it('renders as a modal dialog with every reject reason', () => {
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('[role="radio"]').length).toBe(
      REJECT_REASONS.length,
    );
  });

  it('emits cancel on backdrop click', () => {
    const cancelled: void[] = [];
    fixture.componentInstance.cancel.subscribe(() => cancelled.push(undefined));
    host().querySelector<HTMLElement>('.reject-sheet__backdrop')?.click();
    expect(cancelled.length).toBe(1);
  });

  it('does not cancel on backdrop click while busy', () => {
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    const cancelled: void[] = [];
    fixture.componentInstance.cancel.subscribe(() => cancelled.push(undefined));
    host().querySelector<HTMLElement>('.reject-sheet__backdrop')?.click();
    expect(cancelled.length).toBe(0);
  });

  it('emits reasonSelect and enables confirm once a reason is chosen', () => {
    const emitted: string[] = [];
    fixture.componentInstance.reasonSelect.subscribe((key) => emitted.push(key));
    host().querySelector<HTMLButtonElement>('[role="radio"]')?.click();
    expect(emitted).toEqual([REJECT_REASONS[0].key]);

    fixture.componentRef.setInput('reasonSel', REJECT_REASONS[0].key);
    fixture.detectChanges();
    const confirmBtn = host().querySelector<HTMLButtonElement>('.reject-sheet__btn--confirm')!;
    expect(confirmBtn.disabled).toBe(false);
  });

  it('traps Tab focus within the sheet', () => {
    const focusables = Array.from(
      host().querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    const last = focusables[focusables.length - 1];
    last.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    host().dispatchEvent(event);

    expect(document.activeElement).toBe(focusables[0]);
  });

  it('closes on Escape when not busy', () => {
    const cancelled: void[] = [];
    fixture.componentInstance.cancel.subscribe(() => cancelled.push(undefined));
    fixture.nativeElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(cancelled.length).toBe(1);
  });

  it('restores focus to the previously-focused element on destroy', () => {
    fixture.destroy();
    expect(document.activeElement).toBe(trigger);
  });
});
