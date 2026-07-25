import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import type {
  AuthResponse,
  BackendAuthResponse,
  CurrentUser,
  ExternalAuthRequest,
  LoginRequest,
  RegisterRequest,
} from '../models/auth.models';

/**
 * Normalises the role field from the backend into a string array.
 *
 * The backend can return one of three shapes:
 *   { roles: ['Admin'] }  – ideal string array
 *   { role: 'Admin' }     – single string (claim)
 *   { role: 1 }           – integer enum  (0 = User, 1 = Admin)
 */
export function resolveRoles(raw: Record<string, unknown>): string[] {
  // Preferred: array of strings
  if (Array.isArray(raw['roles'])) {
    return (raw['roles'] as unknown[]).filter((r): r is string => typeof r === 'string');
  }

  const role = raw['role'];

  // Single string role name
  if (typeof role === 'string' && role.trim().length > 0) {
    return [role.trim()];
  }

  // Integer enum: 1 = Admin (0 = regular user)
  if (typeof role === 'number') {
    return role === 1 ? ['Admin'] : [];
  }

  return [];
}

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);

  login(payload: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<BackendAuthResponse>(toApiUrl(ApiContract.auth.login), payload)
      .pipe(map((response) => this.normalizeAuthResponse(response)));
  }

  register(payload: RegisterRequest): Observable<AuthResponse> {
    return this.http
      .post<BackendAuthResponse>(toApiUrl(ApiContract.auth.register), payload)
      .pipe(map((response) => this.normalizeAuthResponse(response)));
  }

  externalAuth(payload: ExternalAuthRequest): Observable<AuthResponse> {
    return this.http
      .post<BackendAuthResponse>(toApiUrl(ApiContract.auth.external), payload)
      .pipe(map((response) => this.normalizeAuthResponse(response)));
  }

  getCurrentUser(): Observable<CurrentUser> {
    return this.http
      .get<Record<string, unknown>>(toApiUrl(ApiContract.auth.currentUser))
      .pipe(map((raw) => this.normalizeCurrentUser(raw)));
  }

  updatePreferredLanguage(code: string | null): Observable<CurrentUser> {
    return this.http
      .put<Record<string, unknown>>(toApiUrl(ApiContract.auth.updatePreferredLanguage), {
        preferredLanguage: code,
      })
      .pipe(map((raw) => this.normalizeCurrentUser(raw)));
  }

  private normalizeCurrentUser(raw: Record<string, unknown>): CurrentUser {
    return {
      id: typeof raw['id'] === 'string' ? raw['id'] : '',
      email: typeof raw['email'] === 'string' ? raw['email'] : '',
      firstName: typeof raw['firstName'] === 'string' ? raw['firstName'] : '',
      lastName: typeof raw['lastName'] === 'string' ? raw['lastName'] : '',
      preferredLanguage:
        typeof raw['preferredLanguage'] === 'string' && raw['preferredLanguage'].length > 0
          ? raw['preferredLanguage']
          : null,
      roles: resolveRoles(raw),
    };
  }

  private normalizeAuthResponse(response: BackendAuthResponse): AuthResponse {
    const resolvedToken = response.token ?? response.accessToken ?? '';
    const token = resolvedToken.trim();

    if (token === '') {
      throw new Error('Authentication token was not returned by the API');
    }

    return {
      token,
      expiresAt: response.expiresAt ?? null,
      user: response.user,
    };
  }
}
