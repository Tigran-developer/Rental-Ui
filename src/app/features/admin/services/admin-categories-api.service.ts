import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import type {
  AdminCategoriesSummary,
  AdminCategory,
  AdminCategoryList,
  CreateAdminCategoryRequest,
  ReorderAdminCategoriesRequest,
  UpdateAdminCategoryRequest,
  UpdateAdminCategoryVisibilityRequest,
} from '../models/admin-category.model';

function toNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecordWithStringId(item: unknown): item is Record<string, unknown> & { id: string } {
  return (
    item !== null &&
    typeof item === 'object' &&
    typeof (item as Record<string, unknown>)['id'] === 'string'
  );
}

// Guards a single-category response (create/update/visibility) against a malformed or
// non-object payload without throwing — falls back to the id we already requested with (or, for
// a create where no id is known yet, an empty string) rather than trusting the wire to echo one
// back. Mirrors AdminListingsApiService's toDetailRecord.
function toCategoryRecord(
  raw: unknown,
  fallbackId: string,
): Record<string, unknown> & { id: string } {
  if (isRecordWithStringId(raw)) return raw;
  const base = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { ...base, id: fallbackId };
}

function normalizeAdminCategory(raw: Record<string, unknown> & { id: string }): AdminCategory {
  return {
    id: raw['id'],
    name: typeof raw['name'] === 'string' ? raw['name'] : '',
    slug: typeof raw['slug'] === 'string' ? raw['slug'] : '',
    iconName: toNullableString(raw['iconName']),
    colorHex: toNullableString(raw['colorHex']),
    displayOrder: toNonNegativeInteger(raw['displayOrder']),
    isVisible: raw['isVisible'] === true,
    listingCount: toNonNegativeInteger(raw['listingCount']),
  };
}

function normalizeAdminCategoryArray(raw: unknown): AdminCategory[] {
  const items = Array.isArray(raw) ? raw : [];
  return items.filter(isRecordWithStringId).map((item) => normalizeAdminCategory(item));
}

function normalizeAdminCategoriesSummary(raw: unknown): AdminCategoriesSummary {
  const obj = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    totalCategories: toNonNegativeInteger(obj['totalCategories']),
    visibleCount: toNonNegativeInteger(obj['visibleCount']),
    totalListedToys: toNonNegativeInteger(obj['totalListedToys']),
  };
}

function normalizeAdminCategoryList(raw: unknown): AdminCategoryList {
  const obj = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    items: normalizeAdminCategoryArray(obj['items']),
    summary: normalizeAdminCategoriesSummary(obj['summary']),
  };
}

@Injectable({ providedIn: 'root' })
export class AdminCategoriesApiService {
  private readonly http = inject(HttpClient);

  getCategories(): Observable<AdminCategoryList> {
    return this.http
      .get<unknown>(toApiUrl(ApiContract.adminCategories.root))
      .pipe(map((raw) => normalizeAdminCategoryList(raw)));
  }

  createCategory(request: CreateAdminCategoryRequest): Observable<AdminCategory> {
    return this.http
      .post<unknown>(toApiUrl(ApiContract.adminCategories.root), request)
      .pipe(map((raw) => normalizeAdminCategory(toCategoryRecord(raw, ''))));
  }

  // See UpdateAdminCategoryRequest's doc comment for the omitted-vs-empty-string PATCH
  // semantics this passes straight through to the wire.
  updateCategory(id: string, request: UpdateAdminCategoryRequest): Observable<AdminCategory> {
    return this.http
      .patch<unknown>(toApiUrl(ApiContract.adminCategories.byId(id)), request)
      .pipe(map((raw) => normalizeAdminCategory(toCategoryRecord(raw, id))));
  }

  updateVisibility(id: string, isVisible: boolean): Observable<AdminCategory> {
    const body: UpdateAdminCategoryVisibilityRequest = { isVisible };
    return this.http
      .patch<unknown>(toApiUrl(ApiContract.adminCategories.visibility(id)), body)
      .pipe(map((raw) => normalizeAdminCategory(toCategoryRecord(raw, id))));
  }

  reorderCategories(orderedIds: string[]): Observable<AdminCategory[]> {
    const body: ReorderAdminCategoriesRequest = { orderedIds };
    return this.http
      .patch<unknown>(toApiUrl(ApiContract.adminCategories.reorder), body)
      .pipe(map((raw) => normalizeAdminCategoryArray(raw)));
  }

  // reassignToCategoryId is required only when the category still has listings
  // (admin.category_reassign_required) — omit it for an empty category.
  deleteCategory(id: string, reassignToCategoryId?: string): Observable<void> {
    let params = new HttpParams();
    if (reassignToCategoryId) {
      params = params.set('reassignToCategoryId', reassignToCategoryId);
    }
    return this.http.delete<void>(toApiUrl(ApiContract.adminCategories.byId(id)), { params });
  }
}
