import { HttpClient, HttpEventType, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, filter, from, map, switchMap } from 'rxjs';

import { ApiContract, toApiUrl } from '../../../api/api-contract';
import { compressImageFiles } from '../../../shared/utils/image-compression.utils';
import type {
  CreateListingRequest,
  CreateListingResponse,
  ListingCategoryOption,
  ListingImageUploadEvent,
  ListingImageUploadResponse,
} from '../models/create-listing.model';
import type {
  ListingDetails,
  ListingDetailsCategory,
  ToyCondition,
} from '../models/listing-details.model';
import type { ListingDistrict } from '../models/district.model';
import type {
  BookedDateRange,
  ListingImage,
  ListingOwner,
  ListingPreview,
} from '../models/listing.model';
import type { ListingMapPin, ListingMapPinsResult } from '../models/listing-map-pin.model';
import type { MapPinsBounds } from '../models/map-pins-bounds.model';
import type { ListingsFilter, ListingsOriginCoords } from '../models/listings-filter.model';
import { clampRadiusKm, parseAgeGroupToMonths } from '../models/listings-filter.model';
import type { PagedResult } from '../models/paged-result.model';
import type { PriceUnit } from '../models/create-listing.model';

export function normalizeListingPreview(
  item: Partial<ListingPreview> & {
    id: string;
    primaryImageUrl?: unknown;
    imageUrl?: unknown;
    images?: unknown;
  },
): ListingPreview {
  return {
    id: String(item.id),
    title: typeof item.title === 'string' ? item.title : '',
    city: typeof item.city === 'string' ? item.city : '',
    pricePerDay:
      typeof item.pricePerDay === 'number' && Number.isFinite(item.pricePerDay)
        ? item.pricePerDay
        : 0,
    mainImageUrl: resolveListingPreviewImageUrl(item),
    isFavorite: item.isFavorite === true,
    ageFromMonths: normalizeFiniteNumber(item.ageFromMonths),
    ageToMonths: normalizeFiniteNumber(item.ageToMonths),
    condition: normalizeNonEmptyString(item.condition),
    hygieneNotes: normalizeNonEmptyString(item.hygieneNotes),
    rating: normalizeFiniteNumber(item.rating),
    reviewCount:
      typeof item.reviewCount === 'number' && Number.isFinite(item.reviewCount)
        ? item.reviewCount
        : 0,
    ownerId: normalizeNonEmptyString(item.ownerId),
    distanceKm: normalizeFiniteNumber(item.distanceKm),
  };
}

/**
 * List/featured/favorites APIs send the card image as `primaryImageUrl`; older
 * payloads may use `imageUrl`, `mainImageUrl`, or a full `images` array. Resolve
 * whichever the backend provides without assuming a single field name.
 */
function resolveListingPreviewImageUrl(item: {
  primaryImageUrl?: unknown;
  mainImageUrl?: unknown;
  imageUrl?: unknown;
  images?: unknown;
}): string | null {
  const direct =
    normalizeNonEmptyString(item.primaryImageUrl) ??
    normalizeNonEmptyString(item.imageUrl) ??
    normalizeNonEmptyString(item.mainImageUrl);
  if (direct !== null) {
    return direct;
  }

  if (Array.isArray(item.images)) {
    const candidates = item.images.filter(
      (image): image is { url?: unknown; isPrimary?: unknown } =>
        image !== null && typeof image === 'object',
    );
    const chosen =
      candidates.find((image) => image.isPrimary === true) ?? candidates[0];
    return normalizeNonEmptyString(chosen?.url);
  }

  return null;
}

function normalizeFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

const TOY_CONDITIONS = new Set<ToyCondition>(['New', 'LikeNew', 'Good', 'Fair', 'Poor']);

/** Narrows an untrusted backend value to a known ToyCondition, or null. */
function normalizeToyCondition(value: unknown): ToyCondition | null {
  return typeof value === 'string' && TOY_CONDITIONS.has(value as ToyCondition)
    ? (value as ToyCondition)
    : null;
}

const PRICE_UNITS = new Set<PriceUnit>(['Hourly', 'Daily', 'Weekly', 'Monthly', 'Yearly']);

/** Narrows an untrusted backend value to a known PriceUnit, defaulting to 'Daily'. */
function normalizePriceUnit(value: unknown): PriceUnit {
  return typeof value === 'string' && PRICE_UNITS.has(value as PriceUnit)
    ? (value as PriceUnit)
    : 'Daily';
}

/**
 * Maps P2-2: normalizes one `GET /api/listings/map-pins` item. `rating` must
 * survive as `null` (below the `reviewCount < 2` aggregate threshold) rather
 * than being coerced to `0` — `normalizeFiniteNumber` already gives us that
 * for free since it only accepts real finite numbers.
 */
export function normalizeListingMapPin(
  item: Partial<ListingMapPin> & { id: string },
): ListingMapPin {
  return {
    id: String(item.id),
    latitude: normalizeFiniteNumber(item.latitude) ?? 0,
    longitude: normalizeFiniteNumber(item.longitude) ?? 0,
    title: typeof item.title === 'string' ? item.title : '',
    pricePerDay:
      typeof item.pricePerDay === 'number' && Number.isFinite(item.pricePerDay)
        ? item.pricePerDay
        : 0,
    priceUnit: normalizePriceUnit(item.priceUnit),
    currency: typeof item.currency === 'string' ? item.currency : '',
    primaryImageUrl: normalizeNonEmptyString(item.primaryImageUrl),
    rating: normalizeFiniteNumber(item.rating),
    reviewCount:
      typeof item.reviewCount === 'number' && Number.isFinite(item.reviewCount)
        ? item.reviewCount
        : 0,
  };
}

@Injectable({ providedIn: 'root' })
export class ListingsApiService {
  private readonly http = inject(HttpClient);

  getListings(
    filter: ListingsFilter,
    page: number,
    pageSize: number,
    originCoords: ListingsOriginCoords | null = null,
  ): Observable<PagedResult<ListingPreview>> {
    const params = this.buildListingsQueryParams(filter, page, pageSize, originCoords);
    return this.http.get<PagedResult<ListingPreview>>(
      toApiUrl(ApiContract.listings.root),
      { params },
    ).pipe(
      map((result) => this.normalizePagedResult(result, page, pageSize)),
      map((result) => ({
        ...result,
        items: (result.items ?? []).map((item) => normalizeListingPreview(item)),
      })),
    );
  }

  getListingById(id: string): Observable<ListingDetails> {
    return this.http
      .get<ListingDetails>(toApiUrl(ApiContract.listings.byId(id)))
      .pipe(map((listing) => this.normalizeListingDetails(listing)));
  }

  createListing(payload: CreateListingRequest): Observable<CreateListingResponse> {
    return this.http.post<CreateListingResponse>(
      toApiUrl(ApiContract.listings.root),
      payload,
    );
  }

  /**
   * Uploads listing images, surfacing upload progress so the wizard can show a
   * progress bar. Emits `progress` events (0–100) followed by a single
   * `complete` event with the created image records.
   */
  uploadListingImages(
    listingId: string,
    files: File[],
  ): Observable<ListingImageUploadEvent> {
    // Compress in the browser first so large phone photos don't blow past the
    // reverse proxy's body-size limit (HTTP 413) on the way to the API.
    return from(compressImageFiles(files)).pipe(
      switchMap((compressed) => {
        const formData = new FormData();

        for (const file of compressed) {
          formData.append('files', file, file.name);
        }

        return this.http.post<ListingImageUploadResponse[]>(
          toApiUrl(ApiContract.listings.uploadImages(listingId)),
          formData,
          { reportProgress: true, observe: 'events' },
        );
      }),
      map((event): ListingImageUploadEvent | null => {
        if (event.type === HttpEventType.UploadProgress) {
          const percent =
            typeof event.total === 'number' && event.total > 0
              ? Math.round((event.loaded / event.total) * 100)
              : 0;
          return { kind: 'progress', percent };
        }
        if (event.type === HttpEventType.Response) {
          return { kind: 'complete', images: event.body ?? [] };
        }
        return null;
      }),
      filter((event): event is ListingImageUploadEvent => event !== null),
    );
  }

  getListingCategories(): Observable<ListingCategoryOption[]> {
    return this.http
      .get<ListingCategoryOption[]>(toApiUrl(ApiContract.categories.root))
      .pipe(
        map((categories) =>
          Array.isArray(categories)
            ? categories
                .filter(
                  (category): category is ListingCategoryOption =>
                    category !== null &&
                    category !== undefined &&
                    typeof category.id === 'string',
                )
                .map((category) => ({
                  id: category.id,
                  name: typeof category.name === 'string' ? category.name : '',
                  slug: typeof category.slug === 'string' ? category.slug : '',
                  imageUrl: normalizeNonEmptyString(category.imageUrl),
                  iconName: normalizeNonEmptyString(category.iconName),
                  displayOrder: normalizeFiniteNumber(category.displayOrder),
                }))
            : [],
        ),
      );
  }

  /**
   * The 12 fixed Yerevan districts, ordered by `nameEn` (backend guarantee — see
   * `DistrictsController`). Anonymous, no NgRx state — same treatment as
   * `getListingCategories()` above; consumers (P1-6 pin picker, P1-8 detail map)
   * call this directly.
   */
  getDistricts(): Observable<ListingDistrict[]> {
    return this.http
      .get<ListingDistrict[]>(toApiUrl(ApiContract.districts.root))
      .pipe(
        map((districts) =>
          Array.isArray(districts)
            ? districts
                .filter(
                  (district): district is ListingDistrict =>
                    district !== null &&
                    district !== undefined &&
                    typeof district.id === 'string',
                )
                .map((district) => ({
                  id: district.id,
                  code: typeof district.code === 'string' ? district.code : '',
                  nameEn: typeof district.nameEn === 'string' ? district.nameEn : '',
                  nameHy: typeof district.nameHy === 'string' ? district.nameHy : '',
                  nameRu: typeof district.nameRu === 'string' ? district.nameRu : '',
                }))
            : [],
        ),
      );
  }

  addToFavorites(listingId: string): Observable<void> {
    return this.http.post<void>(toApiUrl(ApiContract.favorites.byListingId(listingId)), {});
  }

  removeFromFavorites(listingId: string): Observable<void> {
    return this.http.delete<void>(toApiUrl(ApiContract.favorites.byListingId(listingId)));
  }

  /**
   * Maps P2-2: viewport pins for the catalog map view, same `ListingsFilter`
   * shape as `getListings` minus paging. `bounds` is sent all-or-nothing
   * (`minLat`/`maxLat`/`minLng`/`maxLng`) — the backend only applies the box
   * when all four are present, and rejects `minLng > maxLng` (antimeridian)
   * with a 400. Callers (the map component, step 3) must never construct
   * such a viewport.
   */
  getMapPins(
    filter: ListingsFilter,
    bounds: MapPinsBounds | null,
    originCoords: ListingsOriginCoords | null,
  ): Observable<ListingMapPinsResult> {
    let params = this.buildSharedFilterParams(filter, originCoords);
    if (bounds !== null) {
      params = params
        .set('minLat', String(bounds.minLat))
        .set('maxLat', String(bounds.maxLat))
        .set('minLng', String(bounds.minLng))
        .set('maxLng', String(bounds.maxLng));
    }

    return this.http
      .get<{ items?: unknown; isTruncated?: unknown }>(
        toApiUrl(ApiContract.listings.mapPins),
        { params },
      )
      .pipe(map((result) => this.normalizeMapPinsResult(result)));
  }

  private normalizeMapPinsResult(result: {
    items?: unknown;
    isTruncated?: unknown;
  }): ListingMapPinsResult {
    const rawItems = Array.isArray(result.items) ? result.items : [];
    const items = rawItems
      .filter(
        (item): item is Partial<ListingMapPin> & { id: string } =>
          item !== null &&
          typeof item === 'object' &&
          typeof (item as { id?: unknown }).id === 'string',
      )
      .map((item) => normalizeListingMapPin(item));

    return {
      items,
      isTruncated: result.isTruncated === true,
    };
  }

  /**
   * Shared filter serialization for both `getListings` (paged search) and
   * `getMapPins` (viewport pins) — a single code path so the two never drift
   * apart (M-020 was exactly this kind of drift: a filter silently dropped
   * on one of two divergent serializers).
   */
  private buildSharedFilterParams(
    filter: ListingsFilter,
    originCoords: ListingsOriginCoords | null,
  ): HttpParams {
    let params = new HttpParams();

    const query = filter.query?.trim();
    if (query) {
      params = params.set('search', query);
    }

    const city = filter.city?.trim();
    if (city) {
      params = params.set('city', city);
    }

    const categoryId = filter.categoryId?.trim();
    if (categoryId) {
      params = params.set('categoryId', categoryId);
    }

    if (filter.minPrice !== null) {
      params = params.set('minPrice', String(filter.minPrice));
    }
    if (filter.maxPrice !== null) {
      params = params.set('maxPrice', String(filter.maxPrice));
    }

    const ageGroup = filter.ageGroup?.trim();
    const ageBounds = ageGroup ? parseAgeGroupToMonths(ageGroup) : null;
    if (ageBounds) {
      params = params.set('ageFromMonths', String(ageBounds.ageFromMonths));
      if (ageBounds.ageToMonths !== null) {
        params = params.set('ageToMonths', String(ageBounds.ageToMonths));
      }
    }

    // Repeating query key, NOT a single comma-joined value — the backend reads
    // `districtIds` as `List<Guid>` bound from repeated keys
    // (`?districtIds=<guid>&districtIds=<guid>`). `.append` (not `.set`) is
    // required here or only the last id would survive.
    for (const districtId of filter.districtIds) {
      params = params.append('districtIds', districtId);
    }

    // Distance is only meaningful once we know the renter's position; the
    // radius filter's own UI guarantees `originCoords` is set before a
    // `radiusKm` value can even be chosen (design decision #4 — the slider is
    // greyed out until then) — if coords aren't available for any reason,
    // silently omit the distance params rather than send a radius with no
    // origin. `clampRadiusKm` mirrors the backend's own [0.2, 20] clamp
    // (`rental-api` commit `d0955e0`) so this never sends a value the API
    // would silently reclamp anyway.
    if (filter.radiusKm !== null && originCoords !== null) {
      params = params
        .set('originLat', String(originCoords.lat))
        .set('originLng', String(originCoords.lng))
        .set('radiusKm', String(clampRadiusKm(filter.radiusKm)));
    }

    return params;
  }

  /** Adds paging on top of `buildSharedFilterParams` for the paged search call. */
  private buildListingsQueryParams(
    filter: ListingsFilter,
    page: number,
    pageSize: number,
    originCoords: ListingsOriginCoords | null,
  ): HttpParams {
    return this.buildSharedFilterParams(filter, originCoords)
      .set('page', String(page))
      .set('pageSize', String(pageSize));
  }

  private normalizePagedResult<T>(
    result: PagedResult<T>,
    requestedPage: number,
    requestedPageSize: number,
  ): PagedResult<T> {
    const items = Array.isArray(result.items) ? result.items : [];
    const totalCount =
      typeof result.totalCount === 'number' && Number.isFinite(result.totalCount)
        ? result.totalCount
        : items.length;
    const page =
      typeof result.page === 'number' && Number.isFinite(result.page)
        ? result.page
        : requestedPage;
    const pageSize =
      typeof result.pageSize === 'number' && Number.isFinite(result.pageSize)
        ? result.pageSize
        : requestedPageSize;
    const hasMore =
      typeof result.hasMore === 'boolean'
        ? result.hasMore
        : page * pageSize < totalCount;

    return {
      items,
      totalCount,
      page,
      pageSize,
      hasMore,
    };
  }

  private normalizeListingDetails(listing: ListingDetails): ListingDetails {
    const rawCategory = listing.category as Partial<ListingDetailsCategory> | null | undefined;
    const category: ListingDetailsCategory | null =
      rawCategory !== null &&
      rawCategory !== undefined &&
      typeof rawCategory.id === 'string' &&
      typeof rawCategory.name === 'string'
        ? {
            id: rawCategory.id,
            name: rawCategory.name,
            slug: typeof rawCategory.slug === 'string' ? rawCategory.slug : '',
          }
        : null;

    const rawOwner = listing.owner;
    const owner: ListingOwner = {
      id: typeof rawOwner?.id === 'string' ? rawOwner.id : '',
      firstName: typeof rawOwner?.firstName === 'string' ? rawOwner.firstName : '',
      lastName: typeof rawOwner?.lastName === 'string' ? rawOwner.lastName : '',
      phoneNumber:
        typeof rawOwner?.phoneNumber === 'string' && rawOwner.phoneNumber.length > 0
          ? rawOwner.phoneNumber
          : null,
    };

    const images: ListingImage[] = Array.isArray(listing.images)
      ? listing.images
          .filter((image): image is ListingImage => image !== null && image !== undefined)
          .map((image) => ({
            id: typeof image.id === 'string' ? image.id : '',
            url: typeof image.url === 'string' ? image.url : '',
            isPrimary: image.isPrimary === true,
            sortOrder:
              typeof image.sortOrder === 'number' && Number.isFinite(image.sortOrder)
                ? image.sortOrder
                : 0,
          }))
          .filter((image) => image.url.length > 0)
      : [];

    const bookedDateRanges: BookedDateRange[] = Array.isArray(listing.bookedDateRanges)
      ? listing.bookedDateRanges.filter(
          (range): range is BookedDateRange =>
            range !== null &&
            range !== undefined &&
            typeof range.startDate === 'string' &&
            typeof range.endDate === 'string',
        )
      : [];

    return {
      ...listing,
      id: String(listing.id),
      owner,
      images,
      bookedDateRanges,
      category,
      isFavorite: listing.isFavorite === true,
      city: typeof listing.city === 'string' ? listing.city : '',
      description: typeof listing.description === 'string' ? listing.description : '',
      title: typeof listing.title === 'string' ? listing.title : '',
      pricePerDay:
        typeof listing.pricePerDay === 'number' && Number.isFinite(listing.pricePerDay)
          ? listing.pricePerDay
          : 0,
      ageFromMonths: normalizeFiniteNumber(listing.ageFromMonths),
      ageToMonths: normalizeFiniteNumber(listing.ageToMonths),
      condition: normalizeToyCondition(listing.condition),
      hygieneNotes: normalizeNonEmptyString(listing.hygieneNotes),
      safetyNotes: normalizeNonEmptyString(listing.safetyNotes),
      depositAmount: normalizeFiniteNumber(listing.depositAmount),
    };
  }
}
