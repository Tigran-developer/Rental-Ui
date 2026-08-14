import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import type { AdminUser, AdminUserQueue } from '../models/admin-user.model';
import { AdminUsersApiService } from './admin-users-api.service';

const FULL_USER_RAW = {
  id: 'user-1',
  email: 'anahit@toyrent.am',
  firstName: 'Anahit',
  lastName: 'Grigoryan',
  avatarUrl: '/uploads/avatar.jpg',
  role: 'User',
  status: 'Active',
  isIdConfirmed: true,
  marketplaceRole: 'Owner',
  listingCount: 5,
  rentalCount: 2,
  flagCount: 1,
  createdAt: '2026-01-01T00:00:00Z',
};

const FULL_USER_EXPECTED: AdminUser = {
  id: 'user-1',
  email: 'anahit@toyrent.am',
  firstName: 'Anahit',
  lastName: 'Grigoryan',
  avatarUrl: '/uploads/avatar.jpg',
  role: 'User',
  status: 'Active',
  isIdConfirmed: true,
  marketplaceRole: 'Owner',
  listingCount: 5,
  rentalCount: 2,
  flagCount: 1,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('AdminUsersApiService', () => {
  let service: AdminUsersApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminUsersApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getUserQueue', () => {
    it('omits params entirely when none are given, and normalizes a full user row', () => {
      let result: AdminUserQueue | undefined;
      service.getUserQueue().subscribe((queue) => (result = queue));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminUsers.root));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys().length).toBe(0);
      req.flush({
        items: [FULL_USER_RAW],
        page: 1,
        pageSize: 20,
        totalCount: 1,
        totalPages: 1,
        summary: { totalUsers: 1, verifiedCount: 1, pendingCount: 0, suspendedCount: 0 },
      });

      expect(result?.page).toBe(1);
      expect(result?.pageSize).toBe(20);
      expect(result?.totalCount).toBe(1);
      expect(result?.totalPages).toBe(1);
      expect(result?.summary).toEqual({
        totalUsers: 1,
        verifiedCount: 1,
        pendingCount: 0,
        suspendedCount: 0,
      });
      expect(result?.items).toEqual([FULL_USER_EXPECTED]);
    });

    it('sends status/search/sort/page/pageSize as query params, trimming search', () => {
      service
        .getUserQueue({
          status: 'pending',
          search: '  bike  ',
          sort: 'newest',
          page: 2,
          pageSize: 10,
        })
        .subscribe();

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminUsers.root));
      expect(req.request.params.get('status')).toBe('pending');
      expect(req.request.params.get('search')).toBe('bike');
      expect(req.request.params.get('sort')).toBe('newest');
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.get('pageSize')).toBe('10');
      req.flush({
        items: [],
        page: 2,
        pageSize: 10,
        totalCount: 0,
        totalPages: 0,
        summary: { totalUsers: 0, verifiedCount: 0, pendingCount: 0, suspendedCount: 0 },
      });
    });

    it.each(['all', 'pending', 'suspended'] as const)(
      'sends status filter value "%s" verbatim',
      (status) => {
        service.getUserQueue({ status }).subscribe();

        const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminUsers.root));
        expect(req.request.params.get('status')).toBe(status);
        req.flush({
          items: [],
          page: 1,
          pageSize: 20,
          totalCount: 0,
          totalPages: 0,
          summary: { totalUsers: 0, verifiedCount: 0, pendingCount: 0, suspendedCount: 0 },
        });
      },
    );

    it.each(['name', 'newest', 'listings', 'rentals', 'flags'] as const)(
      'sends sort value "%s" verbatim',
      (sort) => {
        service.getUserQueue({ sort }).subscribe();

        const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminUsers.root));
        expect(req.request.params.get('sort')).toBe(sort);
        req.flush({
          items: [],
          page: 1,
          pageSize: 20,
          totalCount: 0,
          totalPages: 0,
          summary: { totalUsers: 0, verifiedCount: 0, pendingCount: 0, suspendedCount: 0 },
        });
      },
    );

    it('omits search param when search is blank/whitespace-only', () => {
      service.getUserQueue({ search: '   ' }).subscribe();

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminUsers.root));
      expect(req.request.params.has('search')).toBe(false);
      req.flush({
        items: [],
        page: 1,
        pageSize: 20,
        totalCount: 0,
        totalPages: 0,
        summary: { totalUsers: 0, verifiedCount: 0, pendingCount: 0, suspendedCount: 0 },
      });
    });

    it('coerces a null avatarUrl to null and preserves a zero flagCount', () => {
      let result: AdminUserQueue | undefined;
      service.getUserQueue().subscribe((queue) => (result = queue));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminUsers.root));
      req.flush({
        items: [{ ...FULL_USER_RAW, avatarUrl: null, flagCount: 0 }],
        page: 1,
        pageSize: 20,
        totalCount: 1,
        totalPages: 1,
        summary: { totalUsers: 1, verifiedCount: 1, pendingCount: 0, suspendedCount: 0 },
      });

      expect(result?.items[0].avatarUrl).toBeNull();
      expect(result?.items[0].flagCount).toBe(0);
    });

    it('falls back to safe defaults for an unrecognised status/marketplaceRole/role', () => {
      let result: AdminUserQueue | undefined;
      service.getUserQueue().subscribe((queue) => (result = queue));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminUsers.root));
      req.flush({
        items: [
          {
            ...FULL_USER_RAW,
            status: 'SomethingNew',
            marketplaceRole: 'SomethingNew',
            role: 'SuperAdmin',
          },
        ],
        page: 1,
        pageSize: 20,
        totalCount: 1,
        totalPages: 1,
        summary: { totalUsers: 1, verifiedCount: 0, pendingCount: 1, suspendedCount: 0 },
      });

      expect(result?.items[0].status).toBe('Pending');
      expect(result?.items[0].marketplaceRole).toBe('Renter');
      expect(result?.items[0].role).toBe('User');
    });

    it('falls back to safe defaults when a user row is missing optional fields', () => {
      let result: AdminUserQueue | undefined;
      service.getUserQueue().subscribe((queue) => (result = queue));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminUsers.root));
      req.flush({
        items: [{ id: 'user-2' }],
        page: 1,
        pageSize: 20,
        totalCount: 1,
        totalPages: 1,
        summary: { totalUsers: 1, verifiedCount: 0, pendingCount: 1, suspendedCount: 0 },
      });

      const item = result?.items[0];
      expect(item?.email).toBe('');
      expect(item?.avatarUrl).toBeNull();
      expect(item?.status).toBe('Pending');
      expect(item?.marketplaceRole).toBe('Renter');
      expect(item?.role).toBe('User');
      expect(item?.isIdConfirmed).toBe(false);
      expect(item?.listingCount).toBe(0);
      expect(item?.rentalCount).toBe(0);
      expect(item?.flagCount).toBe(0);
      expect(item?.createdAt).toBe('');
    });

    it('normalizes a missing/malformed envelope to an empty, zeroed-out queue', () => {
      let result: AdminUserQueue | undefined;
      service.getUserQueue().subscribe((queue) => (result = queue));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminUsers.root));
      req.flush(null);

      expect(result).toEqual({
        items: [],
        page: 0,
        pageSize: 0,
        totalCount: 0,
        totalPages: 0,
        summary: { totalUsers: 0, verifiedCount: 0, pendingCount: 0, suspendedCount: 0 },
      });
    });

    it('drops queue items that are missing a string id', () => {
      let result: AdminUserQueue | undefined;
      service.getUserQueue().subscribe((queue) => (result = queue));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminUsers.root));
      req.flush({
        items: [FULL_USER_RAW, { email: 'no-id@toyrent.am' }, null],
        page: 1,
        pageSize: 20,
        totalCount: 3,
        totalPages: 1,
        summary: { totalUsers: 3, verifiedCount: 1, pendingCount: 2, suspendedCount: 0 },
      });

      expect(result?.items).toHaveLength(1);
      expect(result?.items[0].id).toBe('user-1');
    });
  });

  describe('getUserById', () => {
    it('hits GET /api/admin/users/{id} and normalizes the response', () => {
      let result: AdminUser | undefined;
      service.getUserById('user-1').subscribe((user) => (result = user));

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminUsers.byId('user-1')),
      );
      expect(req.request.method).toBe('GET');
      req.flush(FULL_USER_RAW);

      expect(result).toEqual(FULL_USER_EXPECTED);
    });

    it('URL-encodes the user id', () => {
      service.getUserById('id with space').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminUsers.byId('id with space')),
      );
      expect(req.request.url).toContain('id%20with%20space');
      req.flush(FULL_USER_RAW);
    });

    it('falls back to the requested id when the response body is malformed', () => {
      let result: AdminUser | undefined;
      service.getUserById('user-9').subscribe((user) => (result = user));

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminUsers.byId('user-9')),
      );
      req.flush(null);

      expect(result?.id).toBe('user-9');
      expect(result?.email).toBe('');
      expect(result?.status).toBe('Pending');
    });
  });

  describe('verifyUser', () => {
    it('POSTs an empty body to the verify route and normalizes the response', () => {
      let result: AdminUser | undefined;
      service.verifyUser('user-1').subscribe((user) => (result = user));

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminUsers.verify('user-1')),
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ ...FULL_USER_RAW, isIdConfirmed: true, status: 'Active' });

      expect(result?.isIdConfirmed).toBe(true);
      expect(result?.status).toBe('Active');
    });
  });

  describe('suspendUser', () => {
    it('POSTs an empty body to the suspend route and normalizes the response', () => {
      let result: AdminUser | undefined;
      service.suspendUser('user-1').subscribe((user) => (result = user));

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminUsers.suspend('user-1')),
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ ...FULL_USER_RAW, status: 'Suspended' });

      expect(result?.status).toBe('Suspended');
    });
  });

  describe('reactivateUser', () => {
    it('POSTs an empty body to the reactivate route and normalizes the response', () => {
      let result: AdminUser | undefined;
      service.reactivateUser('user-1').subscribe((user) => (result = user));

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminUsers.reactivate('user-1')),
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ ...FULL_USER_RAW, status: 'Active' });

      expect(result?.status).toBe('Active');
    });
  });
});
