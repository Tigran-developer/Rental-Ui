export interface LoginRequest {
  email: string;
  password: string;
}

export type ExternalAuthProvider = 'google' | 'apple';

export interface ExternalAuthRequest {
  provider: ExternalAuthProvider;
  idToken: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  preferredLanguage?: string | null;
  roles: string[];
}

export interface AuthResponse {
  token: string;
  expiresAt: string | null;
  user?: CurrentUser;
}

export interface BackendAuthResponse {
  token?: string;
  accessToken?: string;
  expiresAt?: string | null;
  user?: CurrentUser;
}
