import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { of, throwError } from 'rxjs';

import { actionsHarness } from '../../../../testing/ngrx.helpers';
import { makeUser } from '../../../../testing/fixtures';
import { LanguageService } from '../../../shared/services/language.service';
import { AuthApiService } from '../services/auth-api.service';
import * as AuthActions from './auth.actions';
import { AuthEffects } from './auth.effects';
import { selectIsAuthenticated } from './auth.selectors';

function setup(api: Partial<AuthApiService> = {}) {
  const harness = actionsHarness();
  const languageService = { applyFromUser: vi.fn() };
  const router = { navigateByUrl: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      AuthEffects,
      harness.provider,
      provideMockStore(),
      { provide: AuthApiService, useValue: api },
      { provide: Router, useValue: router },
      { provide: LanguageService, useValue: languageService },
    ],
  });
  const store = TestBed.inject(MockStore);
  return { harness, store, languageService, effects: TestBed.inject(AuthEffects) };
}

describe('AuthEffects — per-user language persistence', () => {
  describe('applyServerLanguage$ (inbound: server → UI)', () => {
    it('applies the saved preferredLanguage from a loaded user', () => {
      const { harness, effects, languageService } = setup();
      effects.applyServerLanguage$.subscribe();

      harness.send(
        AuthActions.loadCurrentUserSuccess({ user: makeUser({ preferredLanguage: 'hy' }) }),
      );

      expect(languageService.applyFromUser).toHaveBeenCalledWith('hy');
    });

    it('passes null through unchanged when the user has no saved preference (LanguageService no-ops)', () => {
      const { harness, effects, languageService } = setup();
      effects.applyServerLanguage$.subscribe();

      harness.send(
        AuthActions.loadCurrentUserSuccess({ user: makeUser({ preferredLanguage: null }) }),
      );

      expect(languageService.applyFromUser).toHaveBeenCalledWith(null);
    });

    it('never dispatches — it only calls LanguageService directly', () => {
      const { harness, effects } = setup();
      const emissions: unknown[] = [];
      effects.applyServerLanguage$.subscribe((value) => emissions.push(value));

      harness.send(
        AuthActions.loadCurrentUserSuccess({ user: makeUser({ preferredLanguage: 'ru' }) }),
      );

      // dispatch: false effect — emitted value is the source action, not a new one to dispatch.
      expect(emissions).toEqual([
        AuthActions.loadCurrentUserSuccess({ user: makeUser({ preferredLanguage: 'ru' }) }),
      ]);
    });
  });

  describe('persistPreferredLanguage$ (outbound: user-initiated switch → backend)', () => {
    it('calls the API when the user is authenticated', () => {
      const updatePreferredLanguage = vi.fn().mockReturnValue(of(makeUser()));
      const { harness, store, effects } = setup({ updatePreferredLanguage });
      store.overrideSelector(selectIsAuthenticated, true);
      effects.persistPreferredLanguage$.subscribe();

      harness.send(AuthActions.updatePreferredLanguage({ code: 'ru' }));

      expect(updatePreferredLanguage).toHaveBeenCalledWith('ru');
    });

    it('does not call the API when the user is not authenticated (guest switch stays localStorage-only)', () => {
      const updatePreferredLanguage = vi.fn().mockReturnValue(of(makeUser()));
      const { harness, store, effects } = setup({ updatePreferredLanguage });
      store.overrideSelector(selectIsAuthenticated, false);
      effects.persistPreferredLanguage$.subscribe();

      harness.send(AuthActions.updatePreferredLanguage({ code: 'ru' }));

      expect(updatePreferredLanguage).not.toHaveBeenCalled();
    });

    it('swallows API errors quietly — no throw, no emission', () => {
      const updatePreferredLanguage = vi
        .fn()
        .mockReturnValue(throwError(() => new Error('network down')));
      const { harness, store, effects } = setup({ updatePreferredLanguage });
      store.overrideSelector(selectIsAuthenticated, true);

      const emissions: unknown[] = [];
      let errored = false;
      effects.persistPreferredLanguage$.subscribe({
        next: (value) => emissions.push(value),
        error: () => {
          errored = true;
        },
      });

      expect(() =>
        harness.send(AuthActions.updatePreferredLanguage({ code: 'ru' })),
      ).not.toThrow();
      expect(errored).toBe(false);
      expect(emissions).toEqual([]);
    });
  });
});
