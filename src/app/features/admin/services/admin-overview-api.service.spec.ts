import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import type { AdminActivityFeed, AdminOverview } from '../models/admin-overview.model';
import { AdminOverviewApiService } from './admin-overview-api.service';

const FULL_OVERVIEW_RAW = {
  awaitingReviewCount: 4,
  oldestAwaitingCreatedAt: '2026-08-01T00:00:00Z',
  liveListingCount: 120,
  liveListingsAddedThisWeek: 8,
  categoryCount: 15,
  visibleCategoryCount: 13,
  openReportCount: 3,
  averageReviewTimeMinutes: 42.5,
  reviewTimeTargetHours: 6,
};

const FULL_ACTIVITY_ITEM_RAW = {
  id: 'log-1',
  action: 'ListingApproved',
  targetType: 'Listing',
  targetId: 'listing-1',
  targetLabel: 'Balance bike',
  createdAt: '2026-08-01T00:00:00Z',
  actorId: 'user-1',
  actorFirstName: 'Sona',
  actorLastName: 'Karapetyan',
  actorAvatarUrl: '/uploads/avatar.jpg',
  detailJson: '{"categoryId":"cat-1"}',
};

describe('AdminOverviewApiService', () => {
  let service: AdminOverviewApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminOverviewApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getOverview', () => {
    it('hits GET /api/admin/overview and normalizes a full response', () => {
      let result: AdminOverview | undefined;
      service.getOverview().subscribe((overview) => (result = overview));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminOverview.root));
      expect(req.request.method).toBe('GET');
      req.flush(FULL_OVERVIEW_RAW);

      expect(result).toEqual(FULL_OVERVIEW_RAW);
    });

    it('keeps averageReviewTimeMinutes as 0 (instantaneous), distinct from null (no data)', () => {
      let result: AdminOverview | undefined;
      service.getOverview().subscribe((overview) => (result = overview));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminOverview.root));
      req.flush({ ...FULL_OVERVIEW_RAW, averageReviewTimeMinutes: 0 });

      expect(result?.averageReviewTimeMinutes).toBe(0);
    });

    it('normalizes a missing averageReviewTimeMinutes to null, not 0', () => {
      let result: AdminOverview | undefined;
      service.getOverview().subscribe((overview) => (result = overview));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminOverview.root));
      req.flush({ ...FULL_OVERVIEW_RAW, averageReviewTimeMinutes: null });

      expect(result?.averageReviewTimeMinutes).toBeNull();
    });

    it('normalizes a missing/malformed envelope to a zeroed-out overview with null averages', () => {
      let result: AdminOverview | undefined;
      service.getOverview().subscribe((overview) => (result = overview));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminOverview.root));
      req.flush(null);

      expect(result).toEqual({
        awaitingReviewCount: 0,
        oldestAwaitingCreatedAt: null,
        liveListingCount: 0,
        liveListingsAddedThisWeek: 0,
        categoryCount: 0,
        visibleCategoryCount: 0,
        openReportCount: 0,
        averageReviewTimeMinutes: null,
        reviewTimeTargetHours: 0,
      });
    });

    it('normalizes a missing oldestAwaitingCreatedAt to null when the queue is empty', () => {
      let result: AdminOverview | undefined;
      service.getOverview().subscribe((overview) => (result = overview));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminOverview.root));
      req.flush({ ...FULL_OVERVIEW_RAW, oldestAwaitingCreatedAt: null, awaitingReviewCount: 0 });

      expect(result?.oldestAwaitingCreatedAt).toBeNull();
      expect(result?.awaitingReviewCount).toBe(0);
    });
  });

  describe('getActivityFeed', () => {
    it('omits the take param when none is given, and normalizes a full item', () => {
      let result: AdminActivityFeed | undefined;
      service.getActivityFeed().subscribe((feed) => (result = feed));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminOverview.activity));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys().length).toBe(0);
      req.flush({ items: [FULL_ACTIVITY_ITEM_RAW] });

      expect(result?.items).toEqual([FULL_ACTIVITY_ITEM_RAW]);
    });

    it('sends take as a query param when given', () => {
      service.getActivityFeed({ take: 50 }).subscribe();

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminOverview.activity));
      expect(req.request.params.get('take')).toBe('50');
      req.flush({ items: [] });
    });

    it('keeps a row whose actor fields are null (deleted actor) rather than dropping it', () => {
      let result: AdminActivityFeed | undefined;
      service.getActivityFeed().subscribe((feed) => (result = feed));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminOverview.activity));
      req.flush({
        items: [
          {
            ...FULL_ACTIVITY_ITEM_RAW,
            actorFirstName: null,
            actorLastName: null,
            actorAvatarUrl: null,
          },
        ],
      });

      expect(result?.items).toHaveLength(1);
      const item = result?.items[0];
      expect(item?.id).toBe('log-1');
      expect(item?.actorFirstName).toBeNull();
      expect(item?.actorLastName).toBeNull();
      expect(item?.actorAvatarUrl).toBeNull();
    });

    it('passes an unrecognised action string through untouched (widened union, no coercion)', () => {
      let result: AdminActivityFeed | undefined;
      service.getActivityFeed().subscribe((feed) => (result = feed));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminOverview.activity));
      req.flush({ items: [{ ...FULL_ACTIVITY_ITEM_RAW, action: 'SomeFutureAction' }] });

      expect(result?.items[0].action).toBe('SomeFutureAction');
    });

    it('coerces an unrecognised targetType to "Listing" (the enum zero value)', () => {
      let result: AdminActivityFeed | undefined;
      service.getActivityFeed().subscribe((feed) => (result = feed));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminOverview.activity));
      req.flush({ items: [{ ...FULL_ACTIVITY_ITEM_RAW, targetType: 'SomeFutureTarget' }] });

      expect(result?.items[0].targetType).toBe('Listing');
    });

    it('normalizes an empty items array without error', () => {
      let result: AdminActivityFeed | undefined;
      service.getActivityFeed().subscribe((feed) => (result = feed));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminOverview.activity));
      req.flush({ items: [] });

      expect(result?.items).toEqual([]);
    });

    it('normalizes a missing/malformed envelope to an empty feed', () => {
      let result: AdminActivityFeed | undefined;
      service.getActivityFeed().subscribe((feed) => (result = feed));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminOverview.activity));
      req.flush(null);

      expect(result).toEqual({ items: [] });
    });
  });
});
