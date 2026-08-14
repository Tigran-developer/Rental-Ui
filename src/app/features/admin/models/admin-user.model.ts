/**
 * Admin console Phase 3: the Users screen. Mirrors `AdminUserSummaryResponse` /
 * `AdminUserQueueResponse` / `AdminUserQueueFilter` (rental-api
 * `Application/DTOs/AdminUser*.cs`) and the `UserAccountStatus` / `MarketplaceRole` /
 * `UserRole` enums (`Domain/Enums/*.cs`), all serialized as strings by the global
 * `JsonStringEnumConverter`.
 *
 * Deliberately NOT the same model as `features/public-profiles/models/public-profile.model.ts`
 * (`PublicUserProfile`): that one is the [AllowAnonymous] renter-facing profile card (rating
 * aggregates, hygiene/reliability metrics, no email, no moderation state) returned by
 * `GET /api/users/{id}/public-profile`. This one is the admin-only moderation row — email,
 * system role, account status, id-confirmation, and flag/report counts a renter never sees.
 * The two happen to share a few field names (`id`, `avatarUrl`) but are otherwise unrelated
 * shapes from unrelated endpoints; do not merge or extend one from the other.
 */

/**
 * Derived account status (`UserAccountStatus`) — computed from `IsBlocked`/`IsIdConfirmed`,
 * never persisted. Suspended takes priority over Pending.
 */
export type AdminUserStatus = 'Pending' | 'Active' | 'Suspended';

/**
 * Derived marketplace-activity role (`MarketplaceRole`) — has listings => Owner, has
 * bookings-as-renter => Renter, both => Both, neither => Renter. Distinct from the system
 * `AdminUserSystemRole` below: a `Both` marketplace user can still be a system `User`.
 */
export type AdminMarketplaceRole = 'Renter' | 'Owner' | 'Both';

/**
 * The system role (`UserRole`) — Admin vs plain User, gates `[Authorize(Roles = "Admin")]`
 * endpoints. NOT the same axis as `AdminMarketplaceRole` above: do not confuse "is this
 * account an admin" with "does this account mostly rent or list toys."
 */
export type AdminUserSystemRole = 'User' | 'Admin';

/**
 * One row of the admin Users queue — also the shape returned by `GET /api/admin/users/{id}`
 * (profile modal) and by each mutation endpoint (verify/suspend/reactivate), always freshly
 * recomputed after a write. Mirrors `AdminUserSummaryResponse`.
 */
export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: AdminUserSystemRole;
  status: AdminUserStatus;
  isIdConfirmed: boolean;
  marketplaceRole: AdminMarketplaceRole;
  /** Approved listings this user owns. */
  listingCount: number;
  /** Completed bookings this user made as renter. */
  rentalCount: number;
  /**
   * Count of Open reports filed against this user. A real count as of the Phase 4 Reports
   * subsystem (`AdminUsersStore.cs`) — no longer the hardcoded 0 it was before that landed.
   */
  flagCount: number;
  createdAt: string;
}

/**
 * Search-filtered (not status-filtered) aggregate counts for the queue's stat row — stay
 * stable as the admin switches status tabs with the same search term applied. Mirrors
 * `AdminUserQueueSummary`.
 */
export interface AdminUserQueueSummary {
  totalUsers: number;
  verifiedCount: number;
  pendingCount: number;
  suspendedCount: number;
}

/** Mirrors `AdminUserQueueResponse`. */
export interface AdminUserQueue {
  items: AdminUser[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  summary: AdminUserQueueSummary;
}

/**
 * Backend binds this to a loose string ("all" | "pending" | "suspended", case-insensitive) —
 * see `AdminUserQueueFilter.Status`. "active" is a valid row `AdminUserStatus` but
 * intentionally not a filter value the UI exposes; unrecognised/omitted values default to
 * "all" server-side.
 */
export type AdminUserStatusFilter = 'all' | 'pending' | 'suspended';

/**
 * Backend binds this to a loose string, case-insensitive — see `AdminUserQueueFilter.Sort`.
 * Unrecognised/omitted values default to "name" server-side.
 */
export type AdminUserSortOption = 'name' | 'newest' | 'listings' | 'rentals' | 'flags';

export interface AdminUserQueueParams {
  status?: AdminUserStatusFilter;
  search?: string;
  sort?: AdminUserSortOption;
  page?: number;
  pageSize?: number;
}
