import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import type {
  BookingDetail,
  BookingRequest,
  BookingStatus,
  CreateBookingRequest,
  CreateBookingResponse,
  MyBooking,
} from '../models/booking.model';

const KNOWN_BOOKING_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  'PendingApproval',
  'Pending',
  'Approved',
  'Active',
  'ReturnMarked',
  'Rejected',
  'Archived',
  'Cancelled',
  'Expired',
  'Completed',
]);

function coerceBookingStatus(value: unknown): BookingStatus {
  if (typeof value === 'string' && KNOWN_BOOKING_STATUSES.has(value as BookingStatus)) {
    return value as BookingStatus;
  }
  return 'PendingApproval';
}

function toStr(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toNullableStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toFiniteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeCreateBookingResponse(
  response: Partial<CreateBookingResponse> & { id: string },
): CreateBookingResponse {
  return {
    id: String(response.id),
    listingId: toStr(response.listingId),
    status: coerceBookingStatus(response.status),
    startDate: toStr(response.startDate),
    endDate: toStr(response.endDate),
    totalPrice: toFiniteNumber(response.totalPrice),
    createdAt: toNullableStr(response.createdAt),
  };
}

function normalizeMyBooking(item: Partial<MyBooking> & { id: string }): MyBooking {
  return {
    id: String(item.id),
    listingId: toStr(item.listingId),
    listingTitle: toStr(item.listingTitle),
    listingPrimaryImageUrl: toNullableStr(item.listingPrimaryImageUrl),
    ownerFirstName: toStr(item.ownerFirstName),
    ownerLastName: toStr(item.ownerLastName),
    startDate: toStr(item.startDate),
    endDate: toStr(item.endDate),
    totalPrice: toFiniteNumber(item.totalPrice),
    status: coerceBookingStatus(item.status),
    createdAt: toNullableStr(item.createdAt),
  };
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeBookingDetail(item: Partial<BookingDetail> & { id: string }): BookingDetail {
  return {
    id: String(item.id),
    status: coerceBookingStatus(item.status),
    role: item.role === 'owner' ? 'owner' : 'renter',
    listingId: toStr(item.listingId),
    listingTitle: toStr(item.listingTitle),
    listingPrimaryImageUrl: toNullableStr(item.listingPrimaryImageUrl),
    categoryName: toNullableStr(item.categoryName),
    condition: toNullableStr(item.condition),
    city: toStr(item.city),
    country: toStr(item.country),
    addressLine: toNullableStr(item.addressLine),
    currency: toStr(item.currency),
    pricePerDay: toFiniteNumber(item.pricePerDay),
    depositAmount: toNullableNumber(item.depositAmount),
    totalPrice: toFiniteNumber(item.totalPrice),
    startDate: toStr(item.startDate),
    endDate: toStr(item.endDate),
    createdAt: toNullableStr(item.createdAt),
    approvedAt: toNullableStr(item.approvedAt),
    activeAt: toNullableStr(item.activeAt),
    completedAt: toNullableStr(item.completedAt),
    expiresAt: toNullableStr(item.expiresAt),
    rejectionReason: toNullableStr(item.rejectionReason),
    note: toNullableStr(item.note),
    counterpartyId: toStr(item.counterpartyId),
    counterpartyFirstName: toStr(item.counterpartyFirstName),
    counterpartyLastName: toStr(item.counterpartyLastName),
    counterpartyAvatarUrl: toNullableStr(item.counterpartyAvatarUrl),
    counterpartyPhoneNumber: toNullableStr(item.counterpartyPhoneNumber),
  };
}

function normalizeBookingRequest(
  item: Partial<BookingRequest> & { id: string },
): BookingRequest {
  return {
    id: String(item.id),
    listingId: toStr(item.listingId),
    listingTitle: toStr(item.listingTitle),
    renterId: toStr(item.renterId),
    renterFirstName: toStr(item.renterFirstName),
    renterLastName: toStr(item.renterLastName),
    renterEmail: toStr(item.renterEmail),
    renterPhoneNumber: toNullableStr(item.renterPhoneNumber),
    startDate: toStr(item.startDate),
    endDate: toStr(item.endDate),
    totalPrice: toFiniteNumber(item.totalPrice),
    status: coerceBookingStatus(item.status),
    createdAt: toNullableStr(item.createdAt),
    note: toNullableStr(item.note),
  };
}

@Injectable({ providedIn: 'root' })
export class BookingsApiService {
  private readonly http = inject(HttpClient);

  createBooking(payload: CreateBookingRequest): Observable<CreateBookingResponse> {
    return this.http
      .post<CreateBookingResponse>(toApiUrl(ApiContract.bookings.create), payload)
      .pipe(map((response) => normalizeCreateBookingResponse(response)));
  }

  getMyBookings(): Observable<MyBooking[]> {
    return this.http.get<MyBooking[]>(toApiUrl(ApiContract.bookings.mine)).pipe(
      map((items) =>
        Array.isArray(items)
          ? items
              .filter(
                (item): item is MyBooking =>
                  item !== null &&
                  item !== undefined &&
                  typeof item.id === 'string',
              )
              .map((item) => normalizeMyBooking(item))
          : [],
      ),
    );
  }

  getBookingRequests(): Observable<BookingRequest[]> {
    return this.http
      .get<BookingRequest[]>(toApiUrl(ApiContract.bookings.requests))
      .pipe(
        map((items) =>
          Array.isArray(items)
            ? items
                .filter(
                  (item): item is BookingRequest =>
                    item !== null &&
                    item !== undefined &&
                    typeof item.id === 'string',
                )
                .map((item) => normalizeBookingRequest(item))
            : [],
        ),
      );
  }

  approveBookingRequest(bookingId: string): Observable<void> {
    return this.http.post<void>(toApiUrl(ApiContract.bookings.approve(bookingId)), {});
  }

  rejectBookingRequest(bookingId: string, reason?: string | null): Observable<void> {
    return this.http.post<void>(toApiUrl(ApiContract.bookings.reject(bookingId)), {
      reason: reason ?? null,
    });
  }

  getBookingById(bookingId: string): Observable<BookingDetail> {
    return this.http
      .get<BookingDetail>(toApiUrl(ApiContract.bookings.byId(bookingId)))
      .pipe(map((detail) => normalizeBookingDetail(detail)));
  }

  cancelBooking(bookingId: string): Observable<MyBooking> {
    return this.http
      .post<MyBooking>(toApiUrl(ApiContract.bookings.cancel(bookingId)), {})
      .pipe(map((item) => normalizeMyBooking(item as Partial<MyBooking> & { id: string })));
  }

  markActive(bookingId: string): Observable<BookingDetail> {
    return this.http
      .post<BookingDetail>(toApiUrl(ApiContract.bookings.activate(bookingId)), {})
      .pipe(map((detail) => normalizeBookingDetail(detail)));
  }

  complete(bookingId: string): Observable<BookingDetail> {
    return this.http
      .post<BookingDetail>(toApiUrl(ApiContract.bookings.complete(bookingId)), {})
      .pipe(map((detail) => normalizeBookingDetail(detail)));
  }
}
