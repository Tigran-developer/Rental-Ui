import { makeAdminUser } from '../../../../testing/fixtures';
import { canSuspendUser, suspendDisabledReasonKey } from './admin-user-guards.util';

describe('admin-user-guards.util', () => {
  describe('canSuspendUser', () => {
    it('allows suspending a plain user who is not the signed-in admin', () => {
      const user = makeAdminUser({ id: 'user-1', role: 'User' });
      expect(canSuspendUser(user, 'admin-1')).toBe(true);
    });

    it('blocks suspending the signed-in admin’s own row', () => {
      const user = makeAdminUser({ id: 'admin-1', role: 'Admin' });
      expect(canSuspendUser(user, 'admin-1')).toBe(false);
    });

    it('blocks suspending any row whose system role is Admin, even if not the current user', () => {
      const user = makeAdminUser({ id: 'admin-2', role: 'Admin' });
      expect(canSuspendUser(user, 'admin-1')).toBe(false);
    });

    it('allows suspending when there is no known current user id', () => {
      const user = makeAdminUser({ id: 'user-1', role: 'User' });
      expect(canSuspendUser(user, null)).toBe(true);
    });
  });

  describe('suspendDisabledReasonKey', () => {
    it('returns null when suspend is allowed', () => {
      const user = makeAdminUser({ id: 'user-1', role: 'User' });
      expect(suspendDisabledReasonKey(user, 'admin-1')).toBeNull();
    });

    it('returns the self reason for the signed-in admin’s own row', () => {
      const user = makeAdminUser({ id: 'admin-1', role: 'Admin' });
      expect(suspendDisabledReasonKey(user, 'admin-1')).toBe(
        'admin.users.actions.suspendDisabledSelf',
      );
    });

    it('returns the admin reason for another admin row', () => {
      const user = makeAdminUser({ id: 'admin-2', role: 'Admin' });
      expect(suspendDisabledReasonKey(user, 'admin-1')).toBe(
        'admin.users.actions.suspendDisabledAdmin',
      );
    });
  });
});
