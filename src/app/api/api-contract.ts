import { environment } from '../../environments/environment';

type ApiPath = `/${string}`;

const normalizedBaseUrl = environment.apiBaseUrl.replace(/\/+$/, '');

export function toApiUrl(path: ApiPath): string {
  return `${normalizedBaseUrl}${path}`;
}

export const ApiContract = {
  auth: {
    login: '/api/auth/login',
    register: '/api/auth/register',
    currentUser: '/api/auth/me',
    updatePreferredLanguage: '/api/auth/me/preferred-language',
    external: '/api/auth/external',
  },
  listings: {
    root: '/api/listings',
    byId: (id: string): ApiPath => `/api/listings/${encodeURIComponent(id)}`,
    mine: '/api/listings/mine',
    // Maps P2-1: viewport pins, [AllowAnonymous], same ListingsQueryFilter query
    // shape as `root` (see ListingsController.GetMapPins). Consumer:
    // features/listings/components/listings-map/ (Maps P2-2, in progress).
    mapPins: '/api/listings/map-pins',
    uploadImages: (id: string): ApiPath => `/api/listings/${encodeURIComponent(id)}/images`,
    archive: (id: string): ApiPath => `/api/listings/${encodeURIComponent(id)}/archive`,
    restore: (id: string): ApiPath => `/api/listings/${encodeURIComponent(id)}/restore`,
    resubmit: (id: string): ApiPath => `/api/listings/${encodeURIComponent(id)}/resubmit`,
    deleteImage: (listingId: string, imageId: string): ApiPath =>
      `/api/listings/${encodeURIComponent(listingId)}/images/${encodeURIComponent(imageId)}`,
    reorderImages: (listingId: string): ApiPath =>
      `/api/listings/${encodeURIComponent(listingId)}/images/order`,
  },
  categories: {
    root: '/api/categories',
  },
  districts: {
    root: '/api/districts',
  },
  favorites: {
    root: '/api/favorites',
    byListingId: (listingId: string): ApiPath => `/api/favorites/${encodeURIComponent(listingId)}`,
  },
  bookings: {
    create: '/api/bookings',
    mine: '/api/bookings/mine',
    requests: '/api/bookings/requests',
    byId: (bookingId: string): ApiPath => `/api/bookings/${encodeURIComponent(bookingId)}`,
    approve: (bookingId: string): ApiPath =>
      `/api/bookings/${encodeURIComponent(bookingId)}/approve`,
    reject: (bookingId: string): ApiPath => `/api/bookings/${encodeURIComponent(bookingId)}/reject`,
    cancel: (bookingId: string): ApiPath => `/api/bookings/${encodeURIComponent(bookingId)}/cancel`,
    activate: (bookingId: string): ApiPath =>
      `/api/bookings/${encodeURIComponent(bookingId)}/activate`,
    complete: (bookingId: string): ApiPath =>
      `/api/bookings/${encodeURIComponent(bookingId)}/complete`,
  },
  adminListings: {
    // Legacy unpaged queue — still returns PendingListingForReviewResponse[].
    pending: '/api/admin/listings/pending',
    // Phase 1 admin console: paged/searchable queue. Query params (status/page/
    // pageSize/search) are appended via HttpParams by the caller, same
    // convention as `listings.root` — see AdminListingsApiService.
    queue: '/api/admin/listings',
    detail: (listingId: string): ApiPath => `/api/admin/listings/${encodeURIComponent(listingId)}`,
    updateCategory: (listingId: string): ApiPath =>
      `/api/admin/listings/${encodeURIComponent(listingId)}/category`,
    approve: (listingId: string): ApiPath =>
      `/api/admin/listings/${encodeURIComponent(listingId)}/approve`,
    reject: (listingId: string): ApiPath =>
      `/api/admin/listings/${encodeURIComponent(listingId)}/reject`,
  },
  // Admin console Phase 2: the Categories screen. All routes [Authorize(Roles = "Admin")] —
  // see AdminCategoriesController. Distinct from the public, [AllowAnonymous] `categories.root`
  // above (GET /api/categories, renter-facing, no moderation fields).
  adminCategories: {
    root: '/api/admin/categories',
    byId: (categoryId: string): ApiPath =>
      `/api/admin/categories/${encodeURIComponent(categoryId)}`,
    // reassignToCategoryId is appended as a query param by the caller (DELETE only) — same
    // HttpParams convention as `adminListings.queue`, see AdminCategoriesApiService.
    visibility: (categoryId: string): ApiPath =>
      `/api/admin/categories/${encodeURIComponent(categoryId)}/visibility`,
    reorder: '/api/admin/categories/reorder',
  },
  // Admin console Phase 3: the Users screen. All routes [Authorize(Roles = "Admin")] — see
  // AdminUsersController. Query params (status/search/sort/page/pageSize) are appended via
  // HttpParams by the caller, same convention as `adminListings.queue`, see
  // AdminUsersApiService.
  adminUsers: {
    root: '/api/admin/users',
    byId: (userId: string): ApiPath => `/api/admin/users/${encodeURIComponent(userId)}`,
    verify: (userId: string): ApiPath => `/api/admin/users/${encodeURIComponent(userId)}/verify`,
    suspend: (userId: string): ApiPath => `/api/admin/users/${encodeURIComponent(userId)}/suspend`,
    reactivate: (userId: string): ApiPath =>
      `/api/admin/users/${encodeURIComponent(userId)}/reactivate`,
  },
  // Admin console Phase 4: user-facing report submission — see ReportsController.
  // [Authorize], any authenticated non-blocked user. NOT under /api/admin — this is the
  // renter/owner-facing "Report" action taken from listing details / public profiles / chat,
  // distinct from the `adminReports` triage screen below.
  reports: {
    root: '/api/reports',
  },
  // Admin console Phase 4: the Reports & flags screen. All routes [Authorize(Roles = "Admin")]
  // — see AdminReportsController. Query params (status/search/page/pageSize) are appended via
  // HttpParams by the caller, same convention as `adminListings.queue`, see
  // AdminReportsApiService.
  adminReports: {
    root: '/api/admin/reports',
    byId: (reportId: string): ApiPath => `/api/admin/reports/${encodeURIComponent(reportId)}`,
    resolve: (reportId: string): ApiPath =>
      `/api/admin/reports/${encodeURIComponent(reportId)}/resolve`,
    dismiss: (reportId: string): ApiPath =>
      `/api/admin/reports/${encodeURIComponent(reportId)}/dismiss`,
    reopen: (reportId: string): ApiPath =>
      `/api/admin/reports/${encodeURIComponent(reportId)}/reopen`,
  },
  // Admin console Phase 5: the Overview screen (stat tiles, Queue health panel, recent-activity
  // feed). Both routes [Authorize(Roles = "Admin")] — see AdminOverviewController. `activity`
  // takes an optional `take` query param (default 20, server-clamped to 50).
  adminOverview: {
    root: '/api/admin/overview',
    activity: '/api/admin/overview/activity',
  },
  home: {
    sections: '/api/home/sections',
  },
  users: {
    publicProfile: (userId: string): ApiPath =>
      `/api/users/${encodeURIComponent(userId)}/public-profile`,
    listings: (userId: string): ApiPath => `/api/users/${encodeURIComponent(userId)}/listings`,
  },
  reviews: {
    submitToy: '/api/reviews/toy',
    submitOwner: '/api/reviews/owner',
    submitRenter: '/api/reviews/renter',
    bookingStatus: (bookingId: string): ApiPath =>
      `/api/reviews/booking/${encodeURIComponent(bookingId)}/status`,
    listingToyReviews: (listingId: string): ApiPath =>
      `/api/reviews/listing/${encodeURIComponent(listingId)}`,
    ownerReviews: (userId: string): ApiPath => `/api/reviews/owner/${encodeURIComponent(userId)}`,
    renterReviews: (userId: string): ApiPath => `/api/reviews/renter/${encodeURIComponent(userId)}`,
  },
  chat: {
    conversations: '/api/chat/conversations',
    conversationById: (conversationId: string): ApiPath =>
      `/api/chat/conversations/${encodeURIComponent(conversationId)}`,
    read: (conversationId: string): ApiPath =>
      `/api/chat/conversations/${encodeURIComponent(conversationId)}/read`,
    fromBooking: (bookingId: string): ApiPath =>
      `/api/chat/conversations/from-booking/${encodeURIComponent(bookingId)}`,
    messages: '/api/chat/messages',
    sendImageMessage: (conversationId: string): ApiPath =>
      `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages/image`,
    hub: '/hubs/chat',
  },
  notifications: {
    root: '/api/notifications',
    unreadCount: '/api/notifications/unread-count',
    markRead: (notificationId: string): ApiPath =>
      `/api/notifications/${encodeURIComponent(notificationId)}/read`,
    markAllRead: '/api/notifications/read-all',
  },
} as const;
