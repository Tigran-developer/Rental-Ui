import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import * as AuthActions from '../../features/auth/store/auth.actions';
import { LanguageService } from './language.service';

const STORAGE_KEY = 'stayfinder.lang';

// This project's Vitest-based unit-test runner does not implement
// `window.localStorage` out of the box (unlike a real browser or a
// Karma/Chrome run), so tests exercising the service's storage read/write
// need an in-memory stand-in installed once, up front.
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

function createService(): LanguageService {
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [provideMockStore()],
  });
  return TestBed.inject(LanguageService);
}

describe('LanguageService', () => {
  afterEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it('exposes the three supported languages with flag, native and label', () => {
    const service = createService();

    expect(service.languages.map((l) => l.code)).toEqual(['en', 'hy', 'ru']);
    expect(service.languages.find((l) => l.code === 'hy')).toEqual({
      code: 'hy',
      flag: '🇦🇲',
      native: 'Հայերեն',
      label: 'Armenian',
    });
  });

  it('defaults to English when storage is empty', () => {
    const service = createService();

    expect(service.current().code).toBe('en');
  });

  it('defaults to English when storage holds an invalid code', () => {
    window.localStorage.setItem(STORAGE_KEY, 'fr');

    const service = createService();

    expect(service.current().code).toBe('en');
  });

  it('resolves the stored language when it is valid', () => {
    window.localStorage.setItem(STORAGE_KEY, 'ru');

    const service = createService();

    expect(service.current().code).toBe('ru');
  });

  it('hydrate() applies the resolved language to ngx-translate', () => {
    window.localStorage.setItem(STORAGE_KEY, 'hy');
    const service = createService();
    const translate = TestBed.inject(TranslateService);
    const useSpy = vi.spyOn(translate, 'use');

    service.hydrate();

    expect(useSpy).toHaveBeenCalledWith('hy');
  });

  it('use() updates current, calls TranslateService.use, and persists to storage', () => {
    const service = createService();
    const translate = TestBed.inject(TranslateService);
    const useSpy = vi.spyOn(translate, 'use');

    service.use('ru');

    expect(service.current().code).toBe('ru');
    expect(useSpy).toHaveBeenCalledWith('ru');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('ru');
  });

  it('use() does not throw when window.localStorage.setItem throws', () => {
    const service = createService();
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => service.use('hy')).not.toThrow();
    expect(service.current().code).toBe('hy');
    setItemSpy.mockRestore();
  });

  it('use() dispatches updatePreferredLanguage so AuthEffects can persist it when authenticated', () => {
    const service = createService();
    const store = TestBed.inject(MockStore);
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    service.use('ru');

    expect(dispatchSpy).toHaveBeenCalledWith(AuthActions.updatePreferredLanguage({ code: 'ru' }));
  });

  describe('applyFromUser()', () => {
    it('applies a valid server-saved code: updates current, ngx-translate, and storage', () => {
      const service = createService();
      const translate = TestBed.inject(TranslateService);
      const useSpy = vi.spyOn(translate, 'use');

      service.applyFromUser('hy');

      expect(service.current().code).toBe('hy');
      expect(useSpy).toHaveBeenCalledWith('hy');
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('hy');
    });

    it('does not dispatch updatePreferredLanguage (never re-persists an inbound value)', () => {
      const service = createService();
      const store = TestBed.inject(MockStore);
      const dispatchSpy = vi.spyOn(store, 'dispatch');

      service.applyFromUser('hy');

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('no-ops on null (keeps whatever language is currently active)', () => {
      window.localStorage.setItem(STORAGE_KEY, 'ru');
      const service = createService();
      const translate = TestBed.inject(TranslateService);
      const useSpy = vi.spyOn(translate, 'use');

      service.applyFromUser(null);

      expect(service.current().code).toBe('ru');
      expect(useSpy).not.toHaveBeenCalled();
    });

    it('no-ops on undefined', () => {
      const service = createService();
      const before = service.current().code;

      service.applyFromUser(undefined);

      expect(service.current().code).toBe(before);
    });

    it('no-ops on an unknown/unsupported code', () => {
      const service = createService();
      const before = service.current().code;

      service.applyFromUser('fr');

      expect(service.current().code).toBe(before);
    });
  });
});
