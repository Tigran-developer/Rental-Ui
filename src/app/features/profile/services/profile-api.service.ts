import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import { resolveRoles } from '../../auth/services/auth-api.service';
import type { UserProfile } from '../models/profile.model';

// There is no dedicated ProfileController on the backend — the current user's
// profile data is served by GET /api/auth/me (CurrentUserResponse), which
// carries a single `role` field rather than a `roles` array. `resolveRoles`
// (from the auth feature) already normalises that shape; reused here instead
// of duplicating the logic.
function normalizeUserProfile(raw: Record<string, unknown>): UserProfile {
  return {
    id: typeof raw['id'] === 'string' ? raw['id'] : '',
    firstName: typeof raw['firstName'] === 'string' ? raw['firstName'] : '',
    lastName: typeof raw['lastName'] === 'string' ? raw['lastName'] : '',
    email: typeof raw['email'] === 'string' ? raw['email'] : '',
    phoneNumber:
      typeof raw['phoneNumber'] === 'string' && raw['phoneNumber'].length > 0
        ? raw['phoneNumber']
        : null,
    preferredLanguage:
      typeof raw['preferredLanguage'] === 'string' &&
      raw['preferredLanguage'].length > 0
        ? raw['preferredLanguage']
        : null,
    avatarUrl:
      typeof raw['avatarUrl'] === 'string' && raw['avatarUrl'].length > 0
        ? raw['avatarUrl']
        : null,
    createdAt:
      typeof raw['createdAt'] === 'string' && raw['createdAt'].length > 0
        ? raw['createdAt']
        : null,
    isBlocked: raw['isBlocked'] === true,
    roles: resolveRoles(raw),
  };
}

@Injectable({ providedIn: 'root' })
export class ProfileApiService {
  private readonly http = inject(HttpClient);

  getMyProfile(): Observable<UserProfile> {
    return this.http
      .get<Record<string, unknown>>(toApiUrl(ApiContract.auth.currentUser))
      .pipe(map((profile) => normalizeUserProfile(profile)));
  }
}
