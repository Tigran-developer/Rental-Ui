// Mirrors CurrentUserResponse (rental-api DTOs/CurrentUserResponse.cs), served by
// GET /api/auth/me. Backend `Role` is a single UserRole enum (serialized as a string
// by the global JsonStringEnumConverter) — this model normalises it to `roles: string[]`
// via resolveRoles(), matching the auth feature's CurrentUser shape. avatarUrl/createdAt/
// isBlocked are captured here even though the UI doesn't currently render them, so this
// model stays an honest mirror of the wire shape rather than silently dropping fields.
export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  preferredLanguage: string | null;
  avatarUrl: string | null;
  createdAt: string | null;
  isBlocked: boolean;
  roles: string[];
}
