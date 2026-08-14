import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import type { AdminReportQueue, AdminReportRow } from '../models/admin-report.model';
import { AdminReportsApiService } from './admin-reports-api.service';

const FULL_ROW_RAW = {
  id: 'report-1',
  targetType: 'Listing',
  targetId: 'listing-1',
  targetLabel: 'Balance bike',
  targetImageUrl: '/uploads/img-1.jpg',
  reasonCode: 'unsafeItem',
  detail: 'The wheel is loose.',
  severity: 'High',
  status: 'Open',
  createdAt: '2026-08-01T00:00:00Z',
  reporterId: 'user-1',
  reporterFirstName: 'Anahit',
  reporterLastName: 'Grigoryan',
  reporterEmail: 'anahit@toyrent.am',
  reporterAvatarUrl: '/uploads/avatar.jpg',
  resolvedAt: null,
  resolutionNote: null,
};

const FULL_ROW_EXPECTED: AdminReportRow = {
  id: 'report-1',
  targetType: 'Listing',
  targetId: 'listing-1',
  targetLabel: 'Balance bike',
  targetImageUrl: '/uploads/img-1.jpg',
  reasonCode: 'unsafeItem',
  detail: 'The wheel is loose.',
  severity: 'High',
  status: 'Open',
  createdAt: '2026-08-01T00:00:00Z',
  reporterId: 'user-1',
  reporterFirstName: 'Anahit',
  reporterLastName: 'Grigoryan',
  reporterEmail: 'anahit@toyrent.am',
  reporterAvatarUrl: '/uploads/avatar.jpg',
  resolvedAt: null,
  resolutionNote: null,
};

describe('AdminReportsApiService', () => {
  let service: AdminReportsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminReportsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getReportQueue', () => {
    it('omits params entirely when none are given, and normalizes a full row', () => {
      let result: AdminReportQueue | undefined;
      service.getReportQueue().subscribe((queue) => (result = queue));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminReports.root));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys().length).toBe(0);
      req.flush({
        items: [FULL_ROW_RAW],
        page: 1,
        pageSize: 20,
        totalCount: 1,
        totalPages: 1,
        counts: { open: 1, resolved: 2, dismissed: 3, all: 6 },
      });

      expect(result?.page).toBe(1);
      expect(result?.counts).toEqual({ open: 1, resolved: 2, dismissed: 3, all: 6 });
      expect(result?.items).toEqual([FULL_ROW_EXPECTED]);
    });

    it('sends status/search/page/pageSize as query params, trimming search', () => {
      service
        .getReportQueue({ status: 'resolved', search: '  bike  ', page: 2, pageSize: 10 })
        .subscribe();

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminReports.root));
      expect(req.request.params.get('status')).toBe('resolved');
      expect(req.request.params.get('search')).toBe('bike');
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.get('pageSize')).toBe('10');
      req.flush({
        items: [],
        page: 2,
        pageSize: 10,
        totalCount: 0,
        totalPages: 0,
        counts: { open: 0, resolved: 0, dismissed: 0, all: 0 },
      });
    });

    it('coerces a null targetImageUrl to null and unrecognised targetType/severity/status to safe defaults', () => {
      let result: AdminReportQueue | undefined;
      service.getReportQueue().subscribe((queue) => (result = queue));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminReports.root));
      req.flush({
        items: [
          {
            ...FULL_ROW_RAW,
            targetImageUrl: null,
            targetType: 'SomeFutureTarget',
            severity: 'Extreme',
            status: 'InTriage',
          },
        ],
        page: 1,
        pageSize: 20,
        totalCount: 1,
        totalPages: 1,
        counts: { open: 1, resolved: 0, dismissed: 0, all: 1 },
      });

      const row = result?.items[0];
      expect(row?.targetImageUrl).toBeNull();
      // Unrecognised targetType falls back to "Listing" (the enum's zero value).
      expect(row?.targetType).toBe('Listing');
      // Unrecognised severity falls back to "Low" (ReportReasonCatalog.SeverityFor's own
      // fallback for an unrecognised reason code).
      expect(row?.severity).toBe('Low');
      // Unrecognised status falls back to "Open" (the safest "still needs attention" state).
      expect(row?.status).toBe('Open');
    });

    it('falls back to safe defaults when a row is missing optional fields', () => {
      let result: AdminReportQueue | undefined;
      service.getReportQueue().subscribe((queue) => (result = queue));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminReports.root));
      req.flush({
        items: [{ id: 'report-2' }],
        page: 1,
        pageSize: 20,
        totalCount: 1,
        totalPages: 1,
        counts: {},
      });

      const row = result?.items[0];
      expect(row?.targetImageUrl).toBeNull();
      expect(row?.detail).toBeNull();
      expect(row?.resolvedAt).toBeNull();
      expect(row?.resolutionNote).toBeNull();
      expect(row?.targetType).toBe('Listing');
      expect(row?.severity).toBe('Low');
      expect(row?.status).toBe('Open');
      expect(result?.counts).toEqual({ open: 0, resolved: 0, dismissed: 0, all: 0 });
    });

    it('sends targetType/targetId as query params when both are given (Users screen deep link)', () => {
      service.getReportQueue({ targetType: 'User', targetId: 'user-1' }).subscribe();

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminReports.root));
      expect(req.request.params.get('targetType')).toBe('User');
      expect(req.request.params.get('targetId')).toBe('user-1');
      req.flush({
        items: [],
        page: 1,
        pageSize: 20,
        totalCount: 0,
        totalPages: 0,
        counts: { open: 0, resolved: 0, dismissed: 0, all: 0 },
      });
    });

    it('omits targetType/targetId when neither is given', () => {
      service.getReportQueue({ status: 'open' }).subscribe();

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminReports.root));
      expect(req.request.params.has('targetType')).toBe(false);
      expect(req.request.params.has('targetId')).toBe(false);
      req.flush({
        items: [],
        page: 1,
        pageSize: 20,
        totalCount: 0,
        totalPages: 0,
        counts: { open: 0, resolved: 0, dismissed: 0, all: 0 },
      });
    });

    it('normalizes a missing/malformed envelope to an empty, zeroed-out queue', () => {
      let result: AdminReportQueue | undefined;
      service.getReportQueue().subscribe((queue) => (result = queue));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.adminReports.root));
      req.flush(null);

      expect(result).toEqual({
        items: [],
        page: 0,
        pageSize: 0,
        totalCount: 0,
        totalPages: 0,
        counts: { open: 0, resolved: 0, dismissed: 0, all: 0 },
      });
    });
  });

  describe('getReportById', () => {
    it('hits GET /api/admin/reports/{id} and normalizes the row', () => {
      let result: AdminReportRow | undefined;
      service.getReportById('report-1').subscribe((row) => (result = row));

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminReports.byId('report-1')),
      );
      expect(req.request.method).toBe('GET');
      req.flush(FULL_ROW_RAW);

      expect(result).toEqual(FULL_ROW_EXPECTED);
    });

    it('URL-encodes the report id', () => {
      service.getReportById('id with space').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminReports.byId('id with space')),
      );
      expect(req.request.url).toContain('id%20with%20space');
      req.flush(FULL_ROW_RAW);
    });
  });

  describe('resolveReport / dismissReport / reopenReport', () => {
    it('resolveReport POSTs a trimmed note to the resolve route', () => {
      service.resolveReport('report-1', '  looks fine now  ').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminReports.resolve('report-1')),
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ note: 'looks fine now' });
      req.flush(FULL_ROW_RAW);
    });

    it('resolveReport sends null when no note is given', () => {
      service.resolveReport('report-1').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminReports.resolve('report-1')),
      );
      expect(req.request.body).toEqual({ note: null });
      req.flush(FULL_ROW_RAW);
    });

    it('dismissReport POSTs a trimmed note to the dismiss route', () => {
      service.dismissReport('report-1', '  not actionable  ').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminReports.dismiss('report-1')),
      );
      expect(req.request.body).toEqual({ note: 'not actionable' });
      req.flush(FULL_ROW_RAW);
    });

    it('reopenReport POSTs an empty body to the reopen route', () => {
      service.reopenReport('report-1').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminReports.reopen('report-1')),
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(FULL_ROW_RAW);
    });
  });
});
