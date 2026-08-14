import type { AdminUser } from '../models/admin-user.model';

/**
 * Client-side mirror of the two `Suspend` guards `AdminUsersService` enforces server-side
 * (`admin.cannot_suspend_self`, `admin.cannot_suspend_admin` — see `api-error.model.ts`). The
 * server enforces these regardless of what the UI sends, but the UI should not present an
 * action that cannot succeed — hide/disable Suspend for the signed-in admin's own row and for
 * any row whose system `role` is `Admin`.
 *
 * Deliberately NOT applied to Verify or Reactivate: only Suspend is guarded server-side.
 */
export function canSuspendUser(user: AdminUser, currentUserId: string | null): boolean {
  if (user.role === 'Admin') return false;
  if (currentUserId !== null && user.id === currentUserId) return false;
  return true;
}

/**
 * Translation key explaining why Suspend is disabled for this row, or `null` when it isn't
 * guarded. Self takes priority when a row is somehow both (an admin viewing their own row is
 * always both, since only Admin accounts can reach this console).
 */
export function suspendDisabledReasonKey(
  user: AdminUser,
  currentUserId: string | null,
): string | null {
  if (currentUserId !== null && user.id === currentUserId) {
    return 'admin.users.actions.suspendDisabledSelf';
  }
  if (user.role === 'Admin') {
    return 'admin.users.actions.suspendDisabledAdmin';
  }
  return null;
}
