import { isAdminConsoleUrl } from './app';

// Gates the global header/footer/bottom-nav (see app.ts showFooter/
// showBottomNav and app.html) — AdminShellComponent provides its own chrome
// under /admin, so the global chrome must be suppressed there and nowhere
// else.
describe('isAdminConsoleUrl', () => {
  it('is true for the admin console root and any of its child routes', () => {
    expect(isAdminConsoleUrl('/admin')).toBe(true);
    expect(isAdminConsoleUrl('/admin/review')).toBe(true);
    expect(isAdminConsoleUrl('/admin/overview')).toBe(true);
    expect(isAdminConsoleUrl('/admin/categories')).toBe(true);
    expect(isAdminConsoleUrl('/admin/users')).toBe(true);
    expect(isAdminConsoleUrl('/admin/reports')).toBe(true);
    expect(isAdminConsoleUrl('/admin/listings/pending')).toBe(true);
    expect(isAdminConsoleUrl('/admin/review?tab=flagged')).toBe(true);
  });

  it('is false for every non-admin route', () => {
    expect(isAdminConsoleUrl('/')).toBe(false);
    expect(isAdminConsoleUrl('/listings')).toBe(false);
    expect(isAdminConsoleUrl('/profile')).toBe(false);
    expect(isAdminConsoleUrl('/chat/abc')).toBe(false);
    // Must not false-match on a route that merely starts with "admin" as a
    // path segment prefix (e.g. a hypothetical "/administration" page).
    expect(isAdminConsoleUrl('/administration')).toBe(false);
  });
});
