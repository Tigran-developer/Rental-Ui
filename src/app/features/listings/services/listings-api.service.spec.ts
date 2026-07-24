import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import type { ListingsFilter } from '../models/listings-filter.model';
import { ListingsApiService } from './listings-api.service';

// These filters were silently dropped on the way to the API (contract drift,
// M-020): `query` went out as `title` instead of `search`, and `ageGroup` /
// `maxDistance` were never serialized at all. Pin the exact param names/values
// so this can't regress again.
const BASE_FILTER: ListingsFilter = {
  query: null,
  city: null,
  categoryId: null,
  minPrice: null,
  maxPrice: null,
  ageGroup: null,
  maxDistance: null,
  districtIds: [],
};

describe('ListingsApiService — buildListingsQueryParams', () => {
  let service: ListingsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ListingsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('sends the free-text query as `search`, not `title`', () => {
    service.getListings({ ...BASE_FILTER, query: '  lego set  ' }, 1, 20).subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.root),
    );
    expect(req.request.params.get('search')).toBe('lego set');
    expect(req.request.params.has('title')).toBe(false);
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20, hasMore: false });
  });

  it('omits `search` when the query is blank', () => {
    service.getListings({ ...BASE_FILTER, query: '   ' }, 1, 20).subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.root),
    );
    expect(req.request.params.has('search')).toBe(false);
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20, hasMore: false });
  });

  it.each([
    ['0-12', '0', '12'],
    ['12-36', '12', '36'],
    ['36-72', '36', '72'],
    ['72-120', '72', '120'],
  ])('maps ageGroup %s to ageFromMonths=%s, ageToMonths=%s', (ageGroup, from, to) => {
    service.getListings({ ...BASE_FILTER, ageGroup }, 1, 20).subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.root),
    );
    expect(req.request.params.get('ageFromMonths')).toBe(from);
    expect(req.request.params.get('ageToMonths')).toBe(to);
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20, hasMore: false });
  });

  it('maps the open-ended "120+" ageGroup to ageFromMonths=120 with no ageToMonths', () => {
    service.getListings({ ...BASE_FILTER, ageGroup: '120+' }, 1, 20).subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.root),
    );
    expect(req.request.params.get('ageFromMonths')).toBe('120');
    expect(req.request.params.has('ageToMonths')).toBe(false);
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20, hasMore: false });
  });

  it('sends originLat/originLng/radiusKm when maxDistance is set AND coords are available', () => {
    service
      .getListings({ ...BASE_FILTER, maxDistance: 5 }, 1, 20, { lat: 40.1, lng: 44.5 })
      .subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.root),
    );
    expect(req.request.params.get('originLat')).toBe('40.1');
    expect(req.request.params.get('originLng')).toBe('44.5');
    expect(req.request.params.get('radiusKm')).toBe('5');
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20, hasMore: false });
  });

  it('sends no distance params when maxDistance is set but coords are unavailable', () => {
    service.getListings({ ...BASE_FILTER, maxDistance: 5 }, 1, 20, null).subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.root),
    );
    expect(req.request.params.has('originLat')).toBe(false);
    expect(req.request.params.has('originLng')).toBe(false);
    expect(req.request.params.has('radiusKm')).toBe(false);
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20, hasMore: false });
  });

  it('sends no distance params when coords are available but maxDistance is null', () => {
    service
      .getListings({ ...BASE_FILTER, maxDistance: null }, 1, 20, { lat: 40.1, lng: 44.5 })
      .subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.root),
    );
    expect(req.request.params.has('originLat')).toBe(false);
    expect(req.request.params.has('originLng')).toBe(false);
    expect(req.request.params.has('radiusKm')).toBe(false);
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20, hasMore: false });
  });

  it('sends one districtIds param per selected district, not a single comma-joined value', () => {
    service
      .getListings({ ...BASE_FILTER, districtIds: ['d1', 'd2'] }, 1, 20)
      .subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.root),
    );
    expect(req.request.params.getAll('districtIds')).toEqual(['d1', 'd2']);
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20, hasMore: false });
  });

  it('omits districtIds entirely when no district is selected', () => {
    service.getListings({ ...BASE_FILTER, districtIds: [] }, 1, 20).subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.root),
    );
    expect(req.request.params.has('districtIds')).toBe(false);
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20, hasMore: false });
  });

  it('still sends the unrelated city/categoryId/minPrice/maxPrice/page/pageSize params', () => {
    service
      .getListings(
        {
          ...BASE_FILTER,
          city: 'Yerevan',
          categoryId: 'cat-1',
          minPrice: 10,
          maxPrice: 100,
        },
        2,
        20,
      )
      .subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.root),
    );
    expect(req.request.params.get('city')).toBe('Yerevan');
    expect(req.request.params.get('categoryId')).toBe('cat-1');
    expect(req.request.params.get('minPrice')).toBe('10');
    expect(req.request.params.get('maxPrice')).toBe('100');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('20');
    req.flush({ items: [], totalCount: 0, page: 2, pageSize: 20, hasMore: false });
  });
});
