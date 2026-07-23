import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { catchError, map, of, switchMap, withLatestFrom } from 'rxjs';

import { toApiErrorMessage } from '../../../api/http-error-message.util';
import { selectAuthUser } from '../../auth/store/auth.selectors';
import type { CurrentUser } from '../../auth/models/auth.models';
import type { UserProfile } from '../models/profile.model';
import { ProfileApiService } from '../services/profile-api.service';
import * as ProfileActions from './profile.actions';

function toErrorMessage(error: unknown): string {
  return toApiErrorMessage(error);
}

// Fallback used when GET /api/auth/me fails but the auth store already has a
// CurrentUser (e.g. from login). CurrentUser doesn't carry avatarUrl/createdAt/
// isBlocked, so those fall back to null/false here rather than being fabricated.
function mapAuthUserToProfile(user: CurrentUser): UserProfile {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phoneNumber: null,
    preferredLanguage: null,
    avatarUrl: null,
    createdAt: null,
    isBlocked: false,
    roles: [...user.roles],
  };
}

@Injectable()
export class ProfileEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly profileApi = inject(ProfileApiService);

  readonly loadProfile$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ProfileActions.loadProfile),
      withLatestFrom(this.store.select(selectAuthUser)),
      switchMap(([, authUser]) =>
        this.profileApi.getMyProfile().pipe(
          map((profile) => ProfileActions.loadProfileSuccess({ profile })),
          catchError((error: unknown) => {
            if (authUser !== null) {
              return of(
                ProfileActions.loadProfileSuccess({
                  profile: mapAuthUserToProfile(authUser),
                }),
              );
            }
            return of(
              ProfileActions.loadProfileFailure({
                error: toErrorMessage(error),
              }),
            );
          }),
        ),
      ),
    ),
  );
}
