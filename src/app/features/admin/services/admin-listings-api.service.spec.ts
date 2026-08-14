import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import type { AdminListingDetail, AdminListingQueue } from '../models/admin-listing-queue.model';
import { AdminListingsApiService } from './admin-listings-api.service';

const FULL_SUMMARY_RAW = {
  id: 'listing-1',
  ownerId: 'owner-1',
  ownerEmail: 'owner@rental.local',
  ownerFirstName: 'Anahit',
  ownerLastName: 'Grigoryan',
  categoryId: 'cat-1',
  categoryName: 'Ride-ons',
  title: 'Balance bike',
  description: 'A sturdy balance bike.',
  pricePerDay: 1500,
  currency: 'AMD',
  country: 'Armenia',
  city: 'Yerevan',
  addressLine: 'Mashtots 1',
  ageFromMonths: 24,
  ageToMonths: 60,
  condition: 'Good',
  hygieneNotes: 'Wiped down after every rental',
  safetyNotes: 'No sharp edges',
  depositAmount: 5000,
  images: [
    { id: 'img-1', url: '/uploads/img-1.jpg', isPrimary: true, sortOrder: 0 },
    { id: 'img-2', url: '/uploads/img-2.jpg', isPrimary: false, sortOrder: 1 },
  ],
  createdAt: '2026-08-01T00:00:00Z',
  photoCount: 2,
  primaryImageUrl: '/uploads/img-1.jpg',
  rejectionReasonCode: null,
  rejectionNote: null,
  moderatedAt: null,
  ownerAvatarUrl: '/uploads/avatar.jpg',
  ownerIsIdConfirmed: true,
  ownerRating: 4.5,
  ownerReviewCount: 12,
  ownerListingCount: 3,
  ownerCompletedRentals: 20,
  ownerJoinedAt: '2025-01-01T00:00:00Z',
  suggestedCategoryId: 'cat-2',
  suggestedCategoryName: 'Outdoor',
};

describe('AdminListingsApiService', () => {
  let service: AdminListingsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminListingsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getListingQueue', () => {
    it('sends status/search/page/pageSize as query params and hits the queue path', () => {
      service
        .getListingQueue({ status: 'Pending', search: '  bike  ', page: 2, pageSize: 10 })
        .subscribe();

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminListings.queue));
      expect(req.request.params.get('status')).toBe('Pending');
      expect(req.request.params.get('search')).toBe('bike');
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.get('pageSize')).toBe('10');
      req.flush({
        items: [FULL_SUMMARY_RAW],
        page: 2,
        pageSize: 10,
        totalCount: 1,
        totalPages: 1,
        counts: { pending: 1, approved: 0, rejected: 0 },
      });
    });

    it('omits params entirely when none are given, and normalizes a full summary row', () => {
      let result: AdminListingQueue | undefined;
      service.getListingQueue().subscribe((queue) => (result = queue));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminListings.queue));
      expect(req.request.params.keys().length).toBe(0);
      req.flush({
        items: [FULL_SUMMARY_RAW],
        page: 1,
        pageSize: 20,
        totalCount: 1,
        totalPages: 1,
        counts: { pending: 1, approved: 2, rejected: 3 },
      });

      expect(result?.page).toBe(1);
      expect(result?.pageSize).toBe(20);
      expect(result?.totalCount).toBe(1);
      expect(result?.totalPages).toBe(1);
      expect(result?.counts).toEqual({ pending: 1, approved: 2, rejected: 3 });
      expect(result?.items).toHaveLength(1);
      expect(result?.items[0]).toEqual({
        id: 'listing-1',
        ownerId: 'owner-1',
        ownerEmail: 'owner@rental.local',
        ownerFirstName: 'Anahit',
        ownerLastName: 'Grigoryan',
        categoryId: 'cat-1',
        categoryName: 'Ride-ons',
        title: 'Balance bike',
        description: 'A sturdy balance bike.',
        pricePerDay: 1500,
        currency: 'AMD',
        country: 'Armenia',
        city: 'Yerevan',
        addressLine: 'Mashtots 1',
        ageFromMonths: 24,
        ageToMonths: 60,
        condition: 'Good',
        hygieneNotes: 'Wiped down after every rental',
        safetyNotes: 'No sharp edges',
        depositAmount: 5000,
        images: [
          { id: 'img-1', url: '/uploads/img-1.jpg', isPrimary: true, sortOrder: 0 },
          { id: 'img-2', url: '/uploads/img-2.jpg', isPrimary: false, sortOrder: 1 },
        ],
        createdAt: '2026-08-01T00:00:00Z',
        photoCount: 2,
        primaryImageUrl: '/uploads/img-1.jpg',
        rejectionReasonCode: null,
        rejectionNote: null,
        moderatedAt: null,
        ownerAvatarUrl: '/uploads/avatar.jpg',
        ownerIsIdConfirmed: true,
        ownerRating: 4.5,
        ownerReviewCount: 12,
        ownerListingCount: 3,
        ownerCompletedRentals: 20,
        ownerJoinedAt: '2025-01-01T00:00:00Z',
        suggestedCategoryId: 'cat-2',
        suggestedCategoryName: 'Outdoor',
      });
    });

    it('coerces a null ownerRating to null (not 0) and an empty images array to []', () => {
      let result: AdminListingQueue | undefined;
      service.getListingQueue().subscribe((queue) => (result = queue));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminListings.queue));
      req.flush({
        items: [
          {
            ...FULL_SUMMARY_RAW,
            ownerRating: null,
            images: [],
            photoCount: 0,
            primaryImageUrl: null,
          },
        ],
        page: 1,
        pageSize: 20,
        totalCount: 1,
        totalPages: 1,
        counts: { pending: 1, approved: 0, rejected: 0 },
      });

      expect(result?.items[0].ownerRating).toBeNull();
      expect(result?.items[0].images).toEqual([]);
      expect(result?.items[0].photoCount).toBe(0);
      expect(result?.items[0].primaryImageUrl).toBeNull();
    });

    it('falls back to safe defaults when a summary row is missing optional fields', () => {
      let result: AdminListingQueue | undefined;
      service.getListingQueue().subscribe((queue) => (result = queue));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminListings.queue));
      req.flush({
        items: [{ id: 'listing-2' }],
        page: 1,
        pageSize: 20,
        totalCount: 1,
        totalPages: 1,
        counts: { pending: 0, approved: 0, rejected: 0 },
      });

      const item = result?.items[0];
      expect(item?.ownerRating).toBeNull();
      expect(item?.addressLine).toBeNull();
      expect(item?.condition).toBeNull();
      expect(item?.rejectionReasonCode).toBeNull();
      expect(item?.images).toEqual([]);
      expect(item?.ownerIsIdConfirmed).toBe(false);
      expect(item?.ownerReviewCount).toBe(0);
      expect(item?.createdAt).toBe('');
      expect(item?.suggestedCategoryId).toBeNull();
      expect(item?.suggestedCategoryName).toBeNull();
    });

    it('normalizes a missing/malformed envelope to an empty, zeroed-out queue', () => {
      let result: AdminListingQueue | undefined;
      service.getListingQueue().subscribe((queue) => (result = queue));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminListings.queue));
      req.flush(null);

      expect(result).toEqual({
        items: [],
        page: 0,
        pageSize: 0,
        totalCount: 0,
        totalPages: 0,
        counts: { pending: 0, approved: 0, rejected: 0 },
      });
    });
  });

  describe('getListingDetail', () => {
    it('hits GET /api/admin/listings/{id} and normalizes status + ownerOpenReportCount', () => {
      let result: AdminListingDetail | undefined;
      service.getListingDetail('listing-1').subscribe((detail) => (result = detail));

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminListings.detail('listing-1')),
      );
      expect(req.request.method).toBe('GET');
      req.flush({ ...FULL_SUMMARY_RAW, status: 'PendingApproval', ownerOpenReportCount: 0 });

      expect(result?.status).toBe('PendingApproval');
      expect(result?.ownerOpenReportCount).toBe(0);
      expect(result?.ownerRating).toBe(4.5);
    });

    it('falls back to PendingApproval when status is missing or unrecognised', () => {
      let result: AdminListingDetail | undefined;
      service.getListingDetail('listing-1').subscribe((detail) => (result = detail));

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminListings.detail('listing-1')),
      );
      req.flush({ ...FULL_SUMMARY_RAW, status: 'SomeUnknownStatus' });

      expect(result?.status).toBe('PendingApproval');
    });

    it('URL-encodes the listing id', () => {
      service.getListingDetail('id with space').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminListings.detail('id with space')),
      );
      expect(req.request.url).toContain('id%20with%20space');
      req.flush({ ...FULL_SUMMARY_RAW, status: 'PendingApproval' });
    });
  });

  describe('updateListingCategory', () => {
    it('PATCHes /api/admin/listings/{id}/category with the new categoryId and normalizes the response', () => {
      let result: AdminListingDetail | undefined;
      service.updateListingCategory('listing-1', 'cat-2').subscribe((detail) => (result = detail));

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminListings.updateCategory('listing-1')),
      );
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ categoryId: 'cat-2' });
      req.flush({
        ...FULL_SUMMARY_RAW,
        categoryId: 'cat-2',
        categoryName: 'Outdoor',
        status: 'Approved',
      });

      expect(result?.categoryId).toBe('cat-2');
      expect(result?.status).toBe('Approved');
    });
  });

  describe('approve/reject routes', () => {
    it('approveListing POSTs to the approve route', () => {
      service.approveListing('listing-1').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminListings.approve('listing-1')),
      );
      expect(req.request.method).toBe('POST');
      req.flush({});
    });

    it('rejectListing POSTs reasonCode/note to the reject route', () => {
      service.rejectListing('listing-1', 'hygiene', '  needs cleaning  ').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminListings.reject('listing-1')),
      );
      expect(req.request.body).toEqual({ reasonCode: 'hygiene', note: 'needs cleaning' });
      req.flush({});
    });
  });
});
