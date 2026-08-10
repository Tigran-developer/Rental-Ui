export type BookingStatus =
  | 'PendingApproval'
  | 'Pending'
  | 'Approved'
  | 'Active'
  | 'ReturnMarked'
  | 'Rejected'
  | 'Archived'
  | 'Cancelled'
  | 'Expired'
  | 'Completed';

export type BookingParty = 'Renter' | 'Owner';

export type CompletionMethod = 'Mutual' | 'Auto';

export interface CreateBookingRequest {
  listingId: string;
  startDate: string;
  endDate: string;
  // Optional free-text note to the owner (server trims; whitespace-only is treated as
  // absent; >280 chars after trimming is rejected with `booking.note_too_long`).
  note?: string | null;
}

export interface CreateBookingResponse {
  id: string;
  listingId: string;
  status: BookingStatus;
  startDate: string;
  endDate: string;
  totalPrice: number;
  createdAt: string | null;
}

export interface MyBooking {
  id: string;
  listingId: string;
  listingTitle: string;
  listingPrimaryImageUrl: string | null;
  ownerFirstName: string;
  ownerLastName: string;
  startDate: string;
  endDate: string;
  totalPrice: number;
  status: BookingStatus;
  createdAt: string | null;
}

// Full booking detail for the dedicated Booking Details page (GET /api/bookings/:id).
// `role` tells the page which side the current user is; counterparty fields are the
// other party (phone/address only present once the booking is at least Approved).
export interface BookingDetail {
  id: string;
  status: BookingStatus;
  role: 'renter' | 'owner';
  listingId: string;
  listingTitle: string;
  listingPrimaryImageUrl: string | null;
  categoryName: string | null;
  condition: string | null;
  city: string;
  country: string;
  addressLine: string | null;
  currency: string;
  pricePerDay: number;
  depositAmount: number | null;
  totalPrice: number;
  startDate: string;
  endDate: string;
  createdAt: string | null;
  approvedAt: string | null;
  activeAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  rejectionReason: string | null;
  // Renter's free-text note to the owner, visible to both parties from Pending onward
  // (not gated by status). Null when none was provided.
  note: string | null;
  counterpartyId: string;
  counterpartyFirstName: string;
  counterpartyLastName: string;
  counterpartyAvatarUrl: string | null;
  counterpartyPhoneNumber: string | null;
}

export interface BookingRequest {
  id: string;
  listingId: string;
  listingTitle: string;
  renterId: string;
  renterFirstName: string;
  renterLastName: string;
  renterEmail: string;
  renterPhoneNumber: string | null;
  startDate: string;
  endDate: string;
  totalPrice: number;
  status: BookingStatus;
  createdAt: string | null;
  // Renter's free-text note to the owner. Null when none was provided.
  note: string | null;
}
