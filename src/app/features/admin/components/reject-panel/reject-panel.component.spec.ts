import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';

import { REJECT_REASONS } from '../../models/reject-reason.model';
import { RejectPanelComponent } from './reject-panel.component';

describe('RejectPanelComponent', () => {
  let fixture: ComponentFixture<RejectPanelComponent>;
  let trigger: HTMLButtonElement;

  // `ComponentFixture.nativeElement` is typed `any` by Angular, and TS
  // rejects explicit type arguments on calls through an `any`-typed
  // expression — routing through a typed local fixes that.
  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RejectPanelComponent],
      providers: [provideTranslateService({ lang: 'en', fallbackLang: 'en' })],
    }).compileComponents();

    trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    fixture = TestBed.createComponent(RejectPanelComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    trigger.remove();
  });

  it('renders every reject reason as a radio option', () => {
    const radios = fixture.nativeElement.querySelectorAll('[role="radio"]');
    expect(radios.length).toBe(REJECT_REASONS.length);
  });

  it('emits reasonSelect with the clicked reason key', () => {
    const emitted: string[] = [];
    fixture.componentInstance.reasonSelect.subscribe((key) => emitted.push(key));
    host().querySelector<HTMLButtonElement>('[role="radio"]')?.click();
    expect(emitted).toEqual([REJECT_REASONS[0].key]);
  });

  it('disables the confirm button until a reason is selected', () => {
    const confirmBtn = host().querySelector<HTMLButtonElement>('.reject-panel__btn--confirm')!;
    expect(confirmBtn.disabled).toBe(true);

    fixture.componentRef.setInput('reasonSel', REJECT_REASONS[0].key);
    fixture.detectChanges();
    expect(confirmBtn.disabled).toBe(false);
  });

  it('emits confirm and cancel', () => {
    const confirmed: void[] = [];
    const cancelled: void[] = [];
    fixture.componentInstance.confirm.subscribe(() => confirmed.push(undefined));
    fixture.componentInstance.cancel.subscribe(() => cancelled.push(undefined));

    fixture.componentRef.setInput('reasonSel', REJECT_REASONS[0].key);
    fixture.detectChanges();
    host().querySelector<HTMLButtonElement>('.reject-panel__btn--confirm')?.click();
    host().querySelector<HTMLButtonElement>('.reject-panel__btn--cancel')?.click();

    expect(confirmed.length).toBe(1);
    expect(cancelled.length).toBe(1);
  });

  it('restores focus to the previously-focused element on destroy', () => {
    fixture.destroy();
    expect(document.activeElement).toBe(trigger);
  });
});
