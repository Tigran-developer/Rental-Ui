import {
  makeAdmin,
  makeAdminListingDetail,
  makeAdminListingSummary,
  makeBookingDetail,
  makeBookingRequest,
  makeListingPreview,
  makeMyBooking,
  makeReviewStatus,
  makeUser,
} from './fixtures';

// Guards the test harness itself: every builder must return a valid default and
// apply overrides without dropping the other fields. If a production model gains
// a required field, the builder must be updated and this stays green.
describe('test fixtures', () => {
  it('returns sensible, overridable defaults', () => {
    expect(makeUser().roles).toEqual(['User']);
    expect(makeUser({ firstName: 'Grace' }).firstName).toBe('Grace');
    expect(makeUser({ firstName: 'Grace' }).lastName).toBe('Lovelace');

    expect(makeAdmin().roles).toContain('Admin');

    expect(makeListingPreview({ isFavorite: true }).isFavorite).toBe(true);
    expect(makeListingPreview({ isFavorite: true }).id).toBe('listing-1');

    expect(makeMyBooking({ status: 'Completed' }).status).toBe('Completed');
    expect(makeBookingRequest().status).toBe('PendingApproval');
    expect(makeBookingDetail({ role: 'renter' }).role).toBe('renter');
    expect(makeAdminListingSummary({ title: 'X' }).title).toBe('X');
    expect(makeAdminListingDetail({ status: 'Approved' }).status).toBe('Approved');
    expect(makeReviewStatus({ canReviewToy: false }).canReviewToy).toBe(false);
  });
});
