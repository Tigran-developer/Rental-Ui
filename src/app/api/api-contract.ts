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
    uploadImages: (id: string): ApiPath =>
      `/api/listings/${encodeURIComponent(id)}/images`,
    archive: (id: string): ApiPath =>
      `/api/listings/${encodeURIComponent(id)}/archive`,
    restore: (id: string): ApiPath =>
      `/api/listings/${encodeURIComponent(id)}/restore`,
    resubmit: (id: string): ApiPath =>
      `/api/listings/${encodeURIComponent(id)}/resubmit`,
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
    byListingId: (listingId: string): ApiPath =>
      `/api/favorites/${encodeURIComponent(listingId)}`,
  },
  bookings: {
    create: '/api/bookings',
    mine: '/api/bookings/mine',
    requests: '/api/bookings/requests',
    byId: (bookingId: string): ApiPath =>
      `/api/bookings/${encodeURIComponent(bookingId)}`,
    approve: (bookingId: string): ApiPath =>
      `/api/bookings/${encodeURIComponent(bookingId)}/approve`,
    reject: (bookingId: string): ApiPath =>
      `/api/bookings/${encodeURIComponent(bookingId)}/reject`,
    cancel: (bookingId: string): ApiPath =>
      `/api/bookings/${encodeURIComponent(bookingId)}/cancel`,
    activate: (bookingId: string): ApiPath =>
      `/api/bookings/${encodeURIComponent(bookingId)}/activate`,
    complete: (bookingId: string): ApiPath =>
      `/api/bookings/${encodeURIComponent(bookingId)}/complete`,
  },
  adminListings: {
    pending: '/api/admin/listings/pending',
    approve: (listingId: string): ApiPath =>
      `/api/admin/listings/${encodeURIComponent(listingId)}/approve`,
    reject: (listingId: string): ApiPath =>
      `/api/admin/listings/${encodeURIComponent(listingId)}/reject`,
  },
  home: {
    sections: '/api/home/sections',
  },
  users: {
    publicProfile: (userId: string): ApiPath =>
      `/api/users/${encodeURIComponent(userId)}/public-profile`,
    listings: (userId: string): ApiPath =>
      `/api/users/${encodeURIComponent(userId)}/listings`,
  },
  reviews: {
    submitToy: '/api/reviews/toy',
    submitOwner: '/api/reviews/owner',
    submitRenter: '/api/reviews/renter',
    bookingStatus: (bookingId: string): ApiPath =>
      `/api/reviews/booking/${encodeURIComponent(bookingId)}/status`,
    listingToyReviews: (listingId: string): ApiPath =>
      `/api/reviews/listing/${encodeURIComponent(listingId)}`,
    ownerReviews: (userId: string): ApiPath =>
      `/api/reviews/owner/${encodeURIComponent(userId)}`,
    renterReviews: (userId: string): ApiPath =>
      `/api/reviews/renter/${encodeURIComponent(userId)}`,
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
