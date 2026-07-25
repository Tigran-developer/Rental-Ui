import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, catchError, filter, map, mergeMap, of, take, tap, withLatestFrom } from 'rxjs';

import { toApiErrorMessage } from '../../../api/http-error-message.util';
import { LanguageService } from '../../../shared/services/language.service';
import { AuthRedirectService } from '../services/auth-redirect.service';
import { AuthApiService } from '../services/auth-api.service';
import { ExternalAuthProviderService } from '../services/external-auth-provider.service';
import { AuthTokenService } from '../services/auth-token.service';
import * as AuthActions from './auth.actions';
import { selectAuthToken, selectIsAuthenticated } from './auth.selectors';

function toErrorMessage(error: unknown): string {
  return toApiErrorMessage(error, {
    unauthorizedMessage: 'Your session has expired. Please log in again.',
    serverErrorMessage: 'Service is temporarily unavailable. Please try again.',
  });
}

@Injectable()
export class AuthEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApiService);
  private readonly externalAuthProvider = inject(ExternalAuthProviderService);
  private readonly tokenService = inject(AuthTokenService);
  private readonly authRedirect = inject(AuthRedirectService);
  private readonly languageService = inject(LanguageService);

  readonly login$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.login),
      mergeMap(({ payload }) =>
        this.authApi.login(payload).pipe(
          map(({ token }) => AuthActions.loginSuccess({ token })),
          catchError((error: unknown) =>
            of(AuthActions.loginFailure({ error: toErrorMessage(error) })),
          ),
        ),
      ),
    ),
  );

  readonly initAuth$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.authInitStarted),
      take(1),
      map(() => {
        const token = this.tokenService.getToken();
        if (token !== null && token !== '') {
          return AuthActions.loadCurrentUser();
        }
        return AuthActions.authInitCompleted();
      }),
    ),
  );

  readonly register$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.register),
      mergeMap(({ payload }) =>
        this.authApi.register(payload).pipe(
          map(({ token }) => AuthActions.registerSuccess({ token })),
          catchError((error: unknown) =>
            of(AuthActions.registerFailure({ error: toErrorMessage(error) })),
          ),
        ),
      ),
    ),
  );

  readonly externalAuth$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.externalAuth),
      filter(({ idToken }) => idToken.trim() !== ''),
      mergeMap(({ provider, idToken }) =>
        this.authApi.externalAuth({ provider, idToken }).pipe(
          map(({ token }) => AuthActions.externalAuthSuccess({ token })),
          catchError((error: unknown) =>
            of(AuthActions.externalAuthFailure({ error: toErrorMessage(error) })),
          ),
        ),
      ),
    ),
  );

  /**
   * Non-Google providers (currently Apple) dispatch `externalAuth` with an
   * empty `idToken` and resolve it asynchronously here. Google is handled
   * directly by the pages via `ExternalAuthProviderService.renderGoogleButton`,
   * which dispatches `externalAuth` with the idToken already filled.
   */
  readonly resolveExternalAuthToken$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.externalAuth),
      filter(({ provider, idToken }) => provider !== 'google' && idToken === ''),
      mergeMap(({ provider }) =>
        this.externalAuthProvider.getIdToken(provider).pipe(
          map((idToken) => AuthActions.externalAuth({ provider, idToken })),
          catchError((error: unknown) =>
            of(AuthActions.externalAuthFailure({ error: toErrorMessage(error) })),
          ),
        ),
      ),
    ),
  );

  readonly persistToken$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          AuthActions.loginSuccess,
          AuthActions.registerSuccess,
          AuthActions.externalAuthSuccess,
        ),
        tap(({ token }) => {
          this.tokenService.saveToken(token);
        }),
      ),
    { dispatch: false },
  );

  readonly loadCurrentUserAfterAuth$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        AuthActions.loginSuccess,
        AuthActions.registerSuccess,
        AuthActions.externalAuthSuccess,
      ),
      map(() => AuthActions.loadCurrentUser()),
    ),
  );

  readonly navigateAfterAuthenticated$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.loadCurrentUserSuccess),
        tap(() => {
          const returnUrl = this.authRedirect.consume();
          if (returnUrl !== null) {
            void this.router.navigateByUrl(returnUrl);
          }
        }),
      ),
    { dispatch: false },
  );

  readonly loadCurrentUser$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.loadCurrentUser),
      withLatestFrom(this.store.select(selectAuthToken)),
      mergeMap(([, stateToken]) => {
        const token = stateToken ?? this.tokenService.getToken();
        if (!token) {
          return of(
            AuthActions.loadCurrentUserFailure({
              error: 'No auth token found',
              preserveSession: true,
            }),
          );
        }
        return this.authApi.getCurrentUser().pipe(
          map((user) => AuthActions.loadCurrentUserSuccess({ user })),
          catchError((error: unknown) =>
            of(
              AuthActions.loadCurrentUserFailure({
                error: toErrorMessage(error),
                preserveSession: !(error instanceof HttpErrorResponse && error.status === 401),
              }),
            ),
          ),
        );
      }),
    ),
  );

  readonly clearTokenOnLogout$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.logout),
        tap(() => {
          this.tokenService.removeToken();
        }),
      ),
    { dispatch: false },
  );

  readonly navigateAfterLogout$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.logout),
        tap(() => {
          void this.router.navigateByUrl('/auth/login');
        }),
      ),
    { dispatch: false },
  );

  readonly clearTokenOnCurrentUserFailure$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.loadCurrentUserFailure),
        tap(({ preserveSession }) => {
          if (!preserveSession) {
            this.tokenService.removeToken();
          }
        }),
      ),
    { dispatch: false },
  );

  /**
   * Inbound language sync: whenever a current user arrives (app boot with a
   * token, or right after login/register/external auth), apply their saved
   * server preference. `applyFromUser` no-ops on null/unknown, so a user
   * without a saved preference simply keeps whatever is already active.
   */
  readonly applyServerLanguage$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.loadCurrentUserSuccess),
        tap(({ user }) => {
          this.languageService.applyFromUser(user.preferredLanguage);
        }),
      ),
    { dispatch: false },
  );

  /**
   * Outbound language persistence: only when the user is authenticated at
   * the moment of the switch. The local UI/localStorage switch has already
   * happened in `LanguageService.use()` by the time this runs, so a failed
   * persist is swallowed quietly — no error surfaced, no revert.
   */
  readonly persistPreferredLanguage$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.updatePreferredLanguage),
        withLatestFrom(this.store.select(selectIsAuthenticated)),
        filter(([, isAuthenticated]) => isAuthenticated),
        mergeMap(([{ code }]) =>
          this.authApi.updatePreferredLanguage(code).pipe(catchError(() => EMPTY)),
        ),
      ),
    { dispatch: false },
  );
}
