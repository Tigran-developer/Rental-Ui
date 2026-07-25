import { TestBed } from '@angular/core/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';

import { LanguageSelectorComponent } from './language-selector.component';
import { LanguageService } from '../../services/language.service';

// This project's Vitest-based unit-test runner does not implement
// `window.localStorage` out of the box, so the underlying LanguageService
// (which persists the choice on every click) needs an in-memory stand-in.
class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

if (typeof window.localStorage === 'undefined' || window.localStorage === null) {
  Object.defineProperty(window, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}

function createFixture() {
  TestBed.configureTestingModule({
    imports: [LanguageSelectorComponent, TranslateModule.forRoot()],
    providers: [provideMockStore()],
  });

  const fixture = TestBed.createComponent(LanguageSelectorComponent);
  fixture.detectChanges();
  return fixture;
}

function openPanel(fixture: ReturnType<typeof createFixture>) {
  const host: HTMLElement = fixture.nativeElement;
  (host.querySelector('.lang-selector__trigger') as HTMLButtonElement).click();
  fixture.detectChanges();
}

afterEach(() => {
  window.localStorage.removeItem('stayfinder.lang');
});

describe('LanguageSelectorComponent', () => {
  it('renders a closed trigger with the current language code and a chevron', () => {
    const fixture = createFixture();
    const host: HTMLElement = fixture.nativeElement;
    const trigger = host.querySelector('.lang-selector__trigger')!;

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.querySelector('.lang-selector__code')!.textContent?.trim()).toBe('en');
    expect(trigger.querySelector('.lang-selector__chevron')).not.toBeNull();
    expect(host.querySelector('.lang-selector__panel')).toBeNull();
  });

  it('opens the panel with all three options, marking the active one', () => {
    const fixture = createFixture();
    openPanel(fixture);

    const host: HTMLElement = fixture.nativeElement;
    const panel = host.querySelector('.lang-selector__panel')!;
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('role')).toBe('menu');

    const rows = Array.from(panel.querySelectorAll<HTMLButtonElement>('.lang-selector__row'));
    expect(rows.length).toBe(3);
    rows.forEach((row) => expect(row.getAttribute('role')).toBe('menuitemradio'));

    const activeRow = rows.find((r) => r.getAttribute('aria-checked') === 'true')!;
    expect(activeRow.textContent).toContain('English');
  });

  it('clicking an option switches the language, updates the service, and closes the panel', () => {
    const fixture = createFixture();
    openPanel(fixture);

    const host: HTMLElement = fixture.nativeElement;
    const rows = Array.from(host.querySelectorAll<HTMLButtonElement>('.lang-selector__row'));
    const russian = rows.find((r) => r.textContent?.includes('Русский'))!;
    russian.click();
    fixture.detectChanges();

    const languageService = TestBed.inject(LanguageService);
    expect(languageService.current().code).toBe('ru');
    expect(host.querySelector('.lang-selector__panel')).toBeNull();
  });

  it('closes on an outside mousedown', () => {
    const fixture = createFixture();
    openPanel(fixture);

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.lang-selector__panel')).toBeNull();
  });

  it('closes on Escape and returns focus to the trigger', () => {
    const fixture = createFixture();
    openPanel(fixture);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.lang-selector__panel')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('.lang-selector__trigger'));
  });
});
