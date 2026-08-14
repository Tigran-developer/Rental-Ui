import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { AdminTabItem, AdminTabsComponent } from './admin-tabs.component';

const TABS: AdminTabItem[] = [
  { id: 'all', labelKey: 'admin.console.tabs.all', count: 12 },
  { id: 'pending', labelKey: 'admin.console.tabs.pending', count: 3 },
  { id: 'flagged', labelKey: 'admin.console.tabs.flagged', count: null },
];

describe('AdminTabsComponent', () => {
  let fixture: ComponentFixture<AdminTabsComponent>;
  let component: AdminTabsComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminTabsComponent, TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminTabsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('tabs', TABS);
    fixture.componentRef.setInput('value', 'all');
    fixture.detectChanges();
  });

  function buttons(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('button[role="tab"]'));
  }

  it('renders a tablist with one tab per item', () => {
    const list = fixture.nativeElement.querySelector('[role="tablist"]');
    expect(list).not.toBeNull();
    expect(buttons().length).toBe(3);
  });

  it('renders a count chip only for tabs with a non-null count', () => {
    const chips = buttons().map((btn) => btn.querySelector('.admin-tabs__count'));
    expect(chips[0]?.textContent?.trim()).toBe('12');
    expect(chips[1]?.textContent?.trim()).toBe('3');
    expect(chips[2]).toBeNull();
  });

  it('marks the active tab via aria-selected and roving tabindex', () => {
    const btns = buttons();
    expect(btns[0].getAttribute('aria-selected')).toBe('true');
    expect(btns[0].getAttribute('tabindex')).toBe('0');
    expect(btns[1].getAttribute('aria-selected')).toBe('false');
    expect(btns[1].getAttribute('tabindex')).toBe('-1');
  });

  it('emits valueChange on click', () => {
    const emitted: string[] = [];
    component.valueChange.subscribe((id) => emitted.push(id));

    buttons()[1].click();

    expect(emitted).toEqual(['pending']);
  });

  it('moves focus and emits valueChange on ArrowRight', () => {
    const emitted: string[] = [];
    component.valueChange.subscribe((id) => emitted.push(id));
    const btns = buttons();
    btns[0].focus();

    btns[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    expect(emitted).toEqual(['pending']);
    expect(document.activeElement).toBe(btns[1]);
  });

  it('wraps to the first tab on ArrowRight from the last tab', () => {
    const emitted: string[] = [];
    component.valueChange.subscribe((id) => emitted.push(id));
    const btns = buttons();

    btns[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    expect(emitted).toEqual(['all']);
    expect(document.activeElement).toBe(btns[0]);
  });

  it('moves focus backwards on ArrowLeft', () => {
    const emitted: string[] = [];
    component.valueChange.subscribe((id) => emitted.push(id));
    const btns = buttons();

    btns[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();

    expect(emitted).toEqual(['all']);
    expect(document.activeElement).toBe(btns[0]);
  });

  it('jumps to the last tab on End and first on Home', () => {
    const emitted: string[] = [];
    component.valueChange.subscribe((id) => emitted.push(id));
    const btns = buttons();

    btns[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();
    expect(emitted).toEqual(['flagged']);

    btns[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    fixture.detectChanges();
    expect(emitted).toEqual(['flagged', 'all']);
  });
});
