import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import { makeListingMapPin } from '../../../../testing/fixtures';
import type { ListingsFilter } from '../models/listings-filter.model';
import type { MapPinsBounds } from '../models/map-pins-bounds.model';
import { ListingsApiService } from './listings-api.service';
import { expandBookedDateRangesToDisabledDates } from '../components/booking-calendar/booking-calendar.component';

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
  radiusKm: null,
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

  it('sends originLat/originLng/radiusKm when radiusKm is set AND coords are available', () => {
    service
      .getListings({ ...BASE_FILTER, radiusKm: 5 }, 1, 20, { lat: 40.1, lng: 44.5 })
      .subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.root),
    );
    expect(req.request.params.get('originLat')).toBe('40.1');
    expect(req.request.params.get('originLng')).toBe('44.5');
    expect(req.request.params.get('radiusKm')).toBe('5');
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20, hasMore: false });
  });

  it('sends no distance params when radiusKm is set but coords are unavailable', () => {
    service.getListings({ ...BASE_FILTER, radiusKm: 5 }, 1, 20, null).subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.root),
    );
    expect(req.request.params.has('originLat')).toBe(false);
    expect(req.request.params.has('originLng')).toBe(false);
    expect(req.request.params.has('radiusKm')).toBe(false);
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20, hasMore: false });
  });

  it('sends no distance params when coords are available but radiusKm is null', () => {
    service
      .getListings({ ...BASE_FILTER, radiusKm: null }, 1, 20, { lat: 40.1, lng: 44.5 })
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

describe('ListingsApiService — getMapPins', () => {
  let service: ListingsApiService;
  let httpMock: HttpTestingController;

  const BOUNDS: MapPinsBounds = {
    minLat: 40.1,
    maxLat: 40.3,
    minLng: 44.4,
    maxLng: 44.6,
  };

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

  it('hits ApiContract.listings.mapPins, not the paged root', () => {
    service.getMapPins(BASE_FILTER, null, null).subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.mapPins),
    );
    req.flush({ items: [], isTruncated: false });
  });

  it('sends all four viewport params when bounds is fully present', () => {
    service.getMapPins(BASE_FILTER, BOUNDS, null).subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.mapPins),
    );
    expect(req.request.params.get('minLat')).toBe('40.1');
    expect(req.request.params.get('maxLat')).toBe('40.3');
    expect(req.request.params.get('minLng')).toBe('44.4');
    expect(req.request.params.get('maxLng')).toBe('44.6');
    req.flush({ items: [], isTruncated: false });
  });

  it('omits all viewport params when bounds is null', () => {
    service.getMapPins(BASE_FILTER, null, null).subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.mapPins),
    );
    expect(req.request.params.has('minLat')).toBe(false);
    expect(req.request.params.has('maxLat')).toBe(false);
    expect(req.request.params.has('minLng')).toBe(false);
    expect(req.request.params.has('maxLng')).toBe(false);
    req.flush({ items: [], isTruncated: false });
  });

  it('never sends page or pageSize', () => {
    service.getMapPins(BASE_FILTER, BOUNDS, null).subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.mapPins),
    );
    expect(req.request.params.has('page')).toBe(false);
    expect(req.request.params.has('pageSize')).toBe(false);
    req.flush({ items: [], isTruncated: false });
  });

  it('still serializes the shared filters (search/city/districtIds/radius) the same as getListings', () => {
    service
      .getMapPins(
        {
          ...BASE_FILTER,
          query: 'lego',
          city: 'Yerevan',
          districtIds: ['d1', 'd2'],
          radiusKm: 5,
        },
        null,
        { lat: 40.1, lng: 44.5 },
      )
      .subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.mapPins),
    );
    expect(req.request.params.get('search')).toBe('lego');
    expect(req.request.params.get('city')).toBe('Yerevan');
    expect(req.request.params.getAll('districtIds')).toEqual(['d1', 'd2']);
    expect(req.request.params.get('originLat')).toBe('40.1');
    expect(req.request.params.get('originLng')).toBe('44.5');
    expect(req.request.params.get('radiusKm')).toBe('5');
    req.flush({ items: [], isTruncated: false });
  });

  it('normalizes items and preserves isTruncated', () => {
    const pin = makeListingMapPin({ id: 'p1', rating: 4.5, reviewCount: 3 });
    let result: { items: unknown[]; isTruncated: boolean } | undefined;
    service.getMapPins(BASE_FILTER, null, null).subscribe((r) => (result = r));

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.mapPins),
    );
    req.flush({ items: [pin], isTruncated: true });

    expect(result).toEqual({ items: [pin], isTruncated: true });
  });

  it('keeps rating as null rather than coercing it to 0', () => {
    let result: { items: { rating: number | null }[] } | undefined;
    service.getMapPins(BASE_FILTER, null, null).subscribe((r) => (result = r as never));

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.mapPins),
    );
    req.flush({
      items: [
        {
          id: 'p1',
          latitude: 40.1,
          longitude: 44.5,
          title: 'Toy',
          pricePerDay: 5,
          priceUnit: 'Daily',
          currency: 'AMD',
          primaryImageUrl: null,
          rating: null,
          reviewCount: 1,
        },
      ],
      isTruncated: false,
    });

    expect(result?.items[0].rating).toBeNull();
  });
});

describe('ListingsApiService — getListingById', () => {
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

  // Regression for the bug where the frontend model/normalizer read
  // `bookedDates` while `ListingDetailsResponse` (rental-api) actually
  // serializes `bookedDateRanges` — the mismatch silently produced an empty
  // array, so the booking calendar disabled nothing and renters could select
  // already-booked days. This payload is shaped exactly as the API emits it.
  it('normalizes bookedDateRanges from a payload shaped exactly as the API emits it', () => {
    let result: { bookedDateRanges: { startDate: string; endDate: string }[] } | undefined;
    service.getListingById('l1').subscribe((r) => (result = r as never));

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.byId('l1')),
    );
    req.flush({
      id: 'l1',
      title: 'Wooden Train Set',
      description: 'A lovely wooden train set.',
      city: 'Yerevan',
      pricePerDay: 5000,
      images: [],
      owner: { id: 'owner-1', firstName: 'Owen', lastName: 'Owner', phoneNumber: null },
      bookedDateRanges: [
        { startDate: '2026-09-10', endDate: '2026-09-10' },
        { startDate: '2026-09-20', endDate: '2026-09-22' },
      ],
      isFavorite: false,
      category: null,
    });

    expect(result?.bookedDateRanges).toEqual([
      { startDate: '2026-09-10', endDate: '2026-09-10' },
      { startDate: '2026-09-20', endDate: '2026-09-22' },
    ]);

    // The whole point of surfacing this field correctly: expanding it must
    // actually disable the booked days (single-day range + a 3-day range).
    const disabled = expandBookedDateRangesToDisabledDates(result!.bookedDateRanges);
    const isoDatesOf = (dates: Date[]) =>
      dates.map((d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`).sort();

    expect(isoDatesOf(disabled)).toEqual([
      '2026-8-10',
      '2026-8-20',
      '2026-8-21',
      '2026-8-22',
    ]);
  });

  it('falls back to an empty array when bookedDateRanges is missing from the payload', () => {
    let result: { bookedDateRanges: unknown[] } | undefined;
    service.getListingById('l1').subscribe((r) => (result = r as never));

    const req = httpMock.expectOne(
      (r) => r.url === toApiUrl(ApiContract.listings.byId('l1')),
    );
    req.flush({
      id: 'l1',
      title: 'Wooden Train Set',
      description: 'A lovely wooden train set.',
      city: 'Yerevan',
      pricePerDay: 5000,
      images: [],
      owner: { id: 'owner-1', firstName: 'Owen', lastName: 'Owner', phoneNumber: null },
      isFavorite: false,
      category: null,
    });

    expect(result?.bookedDateRanges).toEqual([]);
  });
});
