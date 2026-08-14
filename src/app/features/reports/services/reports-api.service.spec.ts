import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import type { Report } from '../models/report.model';
import { ReportsApiService } from './reports-api.service';

const FULL_REPORT_RAW = {
  id: 'report-1',
  targetType: 'Listing',
  targetId: 'listing-1',
  targetLabel: 'Balance bike',
  reasonCode: 'unsafeItem',
  detail: 'The wheel is loose.',
  severity: 'High',
  status: 'Open',
  createdAt: '2026-08-01T00:00:00Z',
};

const FULL_REPORT_EXPECTED: Report = {
  id: 'report-1',
  targetType: 'Listing',
  targetId: 'listing-1',
  targetLabel: 'Balance bike',
  reasonCode: 'unsafeItem',
  detail: 'The wheel is loose.',
  severity: 'High',
  status: 'Open',
  createdAt: '2026-08-01T00:00:00Z',
};

describe('ReportsApiService', () => {
  let service: ReportsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReportsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('submitReport', () => {
    it('POSTs the lowercase request body verbatim to /api/reports and normalizes the 201 response', () => {
      let result: Report | undefined;
      service
        .submitReport({
          targetType: 'listing',
          targetId: 'listing-1',
          reasonCode: 'unsafeItem',
          detail: 'The wheel is loose.',
        })
        .subscribe((report) => (result = report));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.reports.root));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        targetType: 'listing',
        targetId: 'listing-1',
        reasonCode: 'unsafeItem',
        detail: 'The wheel is loose.',
      });
      req.flush(FULL_REPORT_RAW);

      // The response's targetType comes back PascalCase ("Listing") — a different casing than
      // the lowercase "listing" sent in the request. See the casing-asymmetry note in
      // report.model.ts.
      expect(result).toEqual(FULL_REPORT_EXPECTED);
    });

    it('coerces a null detail to null and an unrecognised targetType/severity/status to safe defaults', () => {
      let result: Report | undefined;
      service
        .submitReport({ targetType: 'user', targetId: 'user-1', reasonCode: 'spam' })
        .subscribe((report) => (result = report));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.reports.root));
      req.flush({
        ...FULL_REPORT_RAW,
        detail: null,
        targetType: 'SomeFutureTarget',
        severity: 'Extreme',
        status: 'InTriage',
      });

      expect(result?.detail).toBeNull();
      expect(result?.targetType).toBe('Listing');
      expect(result?.severity).toBe('Low');
      expect(result?.status).toBe('Open');
    });

    it('normalizes a malformed envelope to safe empty defaults without throwing', () => {
      let result: Report | undefined;
      service
        .submitReport({ targetType: 'message', targetId: 'conv-1', reasonCode: 'rudeMessages' })
        .subscribe((report) => (result = report));

      const req = httpMock.expectOne((r) => r.url === toApiUrl(ApiContract.reports.root));
      req.flush(null);

      expect(result).toEqual({
        id: '',
        targetType: 'Listing',
        targetId: '',
        targetLabel: '',
        reasonCode: '',
        detail: null,
        severity: 'Low',
        status: 'Open',
        createdAt: '',
      });
    });
  });
});
