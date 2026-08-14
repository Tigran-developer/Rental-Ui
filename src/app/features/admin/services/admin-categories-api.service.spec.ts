import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import type { AdminCategory, AdminCategoryList } from '../models/admin-category.model';
import { AdminCategoriesApiService } from './admin-categories-api.service';

const FULL_CATEGORY_RAW = {
  id: 'cat-1',
  name: 'Ride-ons',
  slug: 'ride-ons',
  iconName: 'car',
  colorHex: '#FFAA00',
  displayOrder: 2,
  isVisible: true,
  listingCount: 7,
};

describe('AdminCategoriesApiService', () => {
  let service: AdminCategoriesApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminCategoriesApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getCategories', () => {
    it('GETs the admin categories root and normalizes items + summary', () => {
      let result: AdminCategoryList | undefined;
      service.getCategories().subscribe((list) => (result = list));

      const req = httpMock.expectOne(toApiUrl(ApiContract.adminCategories.root));
      expect(req.request.method).toBe('GET');
      req.flush({
        items: [FULL_CATEGORY_RAW],
        summary: { totalCategories: 5, visibleCount: 4, totalListedToys: 42 },
      });

      expect(result?.items).toEqual([
        {
          id: 'cat-1',
          name: 'Ride-ons',
          slug: 'ride-ons',
          iconName: 'car',
          colorHex: '#FFAA00',
          displayOrder: 2,
          isVisible: true,
          listingCount: 7,
        },
      ]);
      expect(result?.summary).toEqual({
        totalCategories: 5,
        visibleCount: 4,
        totalListedToys: 42,
      });
    });

    it('treats a missing/absent iconName and colorHex, and a listingCount of 0, distinctly from missing fields', () => {
      let result: AdminCategoryList | undefined;
      service.getCategories().subscribe((list) => (result = list));

      const req = httpMock.expectOne(toApiUrl(ApiContract.adminCategories.root));
      req.flush({
        items: [
          {
            id: 'cat-2',
            name: 'Board Games',
            slug: 'board-games',
            iconName: null,
            colorHex: null,
            displayOrder: 0,
            isVisible: false,
            listingCount: 0,
          },
        ],
        summary: { totalCategories: 1, visibleCount: 0, totalListedToys: 0 },
      });

      expect(result?.items[0]).toEqual({
        id: 'cat-2',
        name: 'Board Games',
        slug: 'board-games',
        iconName: null,
        colorHex: null,
        displayOrder: 0,
        isVisible: false,
        listingCount: 0,
      });
    });

    it('falls back to safe defaults for a malformed row and drops rows without a string id', () => {
      let result: AdminCategoryList | undefined;
      service.getCategories().subscribe((list) => (result = list));

      const req = httpMock.expectOne(toApiUrl(ApiContract.adminCategories.root));
      req.flush({
        items: [{ id: 'cat-3' }, { name: 'No id here' }, null],
        summary: { totalCategories: 1, visibleCount: 1, totalListedToys: 0 },
      });

      expect(result?.items).toEqual([
        {
          id: 'cat-3',
          name: '',
          slug: '',
          iconName: null,
          colorHex: null,
          displayOrder: 0,
          isVisible: false,
          listingCount: 0,
        },
      ]);
    });

    it('normalizes a missing/malformed envelope to an empty list with zeroed summary', () => {
      let result: AdminCategoryList | undefined;
      service.getCategories().subscribe((list) => (result = list));

      const req = httpMock.expectOne(toApiUrl(ApiContract.adminCategories.root));
      req.flush(null);

      expect(result).toEqual({
        items: [],
        summary: { totalCategories: 0, visibleCount: 0, totalListedToys: 0 },
      });
    });
  });

  describe('createCategory', () => {
    it('POSTs the request as-is and normalizes the created category', () => {
      let result: AdminCategory | undefined;
      service
        .createCategory({ name: 'Outdoor', iconName: 'tree', colorHex: '#00AA00' })
        .subscribe((category) => (result = category));

      const req = httpMock.expectOne(toApiUrl(ApiContract.adminCategories.root));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        name: 'Outdoor',
        iconName: 'tree',
        colorHex: '#00AA00',
      });
      req.flush({ ...FULL_CATEGORY_RAW, id: 'cat-4', name: 'Outdoor' });

      expect(result?.id).toBe('cat-4');
      expect(result?.name).toBe('Outdoor');
    });

    it('omits iconName/colorHex from the body when not supplied', () => {
      service.createCategory({ name: 'Books' }).subscribe();

      const req = httpMock.expectOne(toApiUrl(ApiContract.adminCategories.root));
      expect(req.request.body).toEqual({ name: 'Books' });
      req.flush({ ...FULL_CATEGORY_RAW, id: 'cat-5', name: 'Books' });
    });
  });

  describe('updateCategory', () => {
    it('PATCHes /api/admin/categories/{id} with only the supplied fields (leave-unchanged semantics)', () => {
      let result: AdminCategory | undefined;
      service
        .updateCategory('cat-1', { name: 'Renamed' })
        .subscribe((category) => (result = category));

      const req = httpMock.expectOne(toApiUrl(ApiContract.adminCategories.byId('cat-1')));
      expect(req.request.method).toBe('PATCH');
      // iconName/colorHex must be absent from the serialized body, not present-as-undefined —
      // JSON.stringify drops undefined-valued keys, which is what signals "leave unchanged" to
      // the backend's PATCH semantics.
      expect(req.request.body).toEqual({ name: 'Renamed' });
      expect('iconName' in req.request.body).toBe(false);
      expect('colorHex' in req.request.body).toBe(false);
      req.flush({ ...FULL_CATEGORY_RAW, name: 'Renamed' });

      expect(result?.name).toBe('Renamed');
    });

    it('sends an empty string to distinctly express "clear the field" from "leave unchanged"', () => {
      service.updateCategory('cat-1', { iconName: '', colorHex: '' }).subscribe();

      const req = httpMock.expectOne(toApiUrl(ApiContract.adminCategories.byId('cat-1')));
      expect(req.request.body).toEqual({ iconName: '', colorHex: '' });
      expect('name' in req.request.body).toBe(false);
      req.flush({ ...FULL_CATEGORY_RAW, iconName: null, colorHex: null });
    });

    it('URL-encodes the category id', () => {
      service.updateCategory('id with space', { name: 'x' }).subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminCategories.byId('id with space')),
      );
      expect(req.request.url).toContain('id%20with%20space');
      req.flush({ ...FULL_CATEGORY_RAW, id: 'id with space' });
    });

    it('falls back to the requested id when the response is malformed', () => {
      let result: AdminCategory | undefined;
      service.updateCategory('cat-1', { name: 'x' }).subscribe((category) => (result = category));

      const req = httpMock.expectOne(toApiUrl(ApiContract.adminCategories.byId('cat-1')));
      req.flush(null);

      expect(result?.id).toBe('cat-1');
      expect(result?.name).toBe('');
    });
  });

  describe('updateVisibility', () => {
    it('PATCHes /api/admin/categories/{id}/visibility with isVisible', () => {
      let result: AdminCategory | undefined;
      service.updateVisibility('cat-1', false).subscribe((category) => (result = category));

      const req = httpMock.expectOne(toApiUrl(ApiContract.adminCategories.visibility('cat-1')));
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ isVisible: false });
      req.flush({ ...FULL_CATEGORY_RAW, isVisible: false });

      expect(result?.isVisible).toBe(false);
    });
  });

  describe('reorderCategories', () => {
    it('PATCHes /api/admin/categories/reorder with orderedIds and normalizes the returned array', () => {
      let result: AdminCategory[] | undefined;
      service
        .reorderCategories(['cat-2', 'cat-1'])
        .subscribe((categories) => (result = categories));

      const req = httpMock.expectOne(toApiUrl(ApiContract.adminCategories.reorder));
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ orderedIds: ['cat-2', 'cat-1'] });
      req.flush([
        { ...FULL_CATEGORY_RAW, id: 'cat-2', displayOrder: 0 },
        { ...FULL_CATEGORY_RAW, id: 'cat-1', displayOrder: 1 },
      ]);

      expect(result?.map((c) => c.id)).toEqual(['cat-2', 'cat-1']);
    });

    it('normalizes a non-array response to an empty array', () => {
      let result: AdminCategory[] | undefined;
      service.reorderCategories(['cat-1']).subscribe((categories) => (result = categories));

      const req = httpMock.expectOne(toApiUrl(ApiContract.adminCategories.reorder));
      req.flush(null);

      expect(result).toEqual([]);
    });
  });

  describe('deleteCategory', () => {
    it('DELETEs /api/admin/categories/{id} with no query param when no reassign target is given', () => {
      service.deleteCategory('cat-1').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminCategories.byId('cat-1')),
      );
      expect(req.request.method).toBe('DELETE');
      expect(req.request.params.keys().length).toBe(0);
      req.flush(null);
    });

    it('DELETEs with reassignToCategoryId as a query param when a reassign target is given', () => {
      service.deleteCategory('cat-1', 'cat-2').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === toApiUrl(ApiContract.adminCategories.byId('cat-1')),
      );
      expect(req.request.params.get('reassignToCategoryId')).toBe('cat-2');
      req.flush(null);
    });
  });
});
