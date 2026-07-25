import { createAction, props } from '@ngrx/store';

import type {
  CurrentUser,
  ExternalAuthProvider,
  LoginRequest,
  RegisterRequest,
} from '../models/auth.models';

export const login = createAction(
  '[Auth] Login',
  props<{ payload: LoginRequest }>(),
);

export const loginSuccess = createAction(
  '[Auth] Login Success',
  props<{ token: string }>(),
);

export const loginFailure = createAction(
  '[Auth] Login Failure',
  props<{ error: string }>(),
);

export const register = createAction(
  '[Auth] Register',
  props<{ payload: RegisterRequest }>(),
);

export const registerSuccess = createAction(
  '[Auth] Register Success',
  props<{ token: string }>(),
);

export const registerFailure = createAction(
  '[Auth] Register Failure',
  props<{ error: string }>(),
);

export const externalAuth = createAction(
  '[Auth] External Auth',
  props<{ provider: ExternalAuthProvider; idToken: string }>(),
);

export const externalAuthSuccess = createAction(
  '[Auth] External Auth Success',
  props<{ token: string }>(),
);

export const externalAuthFailure = createAction(
  '[Auth] External Auth Failure',
  props<{ error: string }>(),
);

export const loadCurrentUser = createAction('[Auth] Load Current User');

export const loadCurrentUserSuccess = createAction(
  '[Auth] Load Current User Success',
  props<{ user: CurrentUser }>(),
);

export const loadCurrentUserFailure = createAction(
  '[Auth] Load Current User Failure',
  props<{ error: string; preserveSession?: boolean }>(),
);

export const logout = createAction('[Auth] Logout');

/**
 * Dispatched once by App constructor after all effects are registered.
 * Using this instead of ROOT_EFFECTS_INIT because ROOT_EFFECTS_INIT fires from
 * the first provideEffects() call — before AuthEffects is registered — so
 * initAuth$ would miss it on a hot actions$ Subject.
 */
export const authInitStarted = createAction('[Auth] Init Started');

/** Dispatched by initAuth$ when no token exists — signals clean anonymous startup. */
export const authInitCompleted = createAction('[Auth] Init Completed');

/** Clears a stale auth error without triggering any HTTP request (e.g., when switching
 *  between login and register modes inside the auth dialog). */
export const clearAuthError = createAction('[Auth] Clear Error');

/**
 * User-initiated language switch, dispatched by `LanguageService.use()` on
 * every switch regardless of auth state. `AuthEffects.persistPreferredLanguage$`
 * gates on `selectIsAuthenticated` and persists to the backend only when
 * signed in; the local UI/localStorage switch has already happened by the
 * time this fires, so a failed persist is swallowed quietly (no revert, no
 * disruptive error surfaced to the user).
 */
export const updatePreferredLanguage = createAction(
  '[Auth] Update Preferred Language',
  props<{ code: string }>(),
);
