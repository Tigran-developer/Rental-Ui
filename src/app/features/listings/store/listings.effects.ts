import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import {
  catchError,
  concatMap,
  EMPTY,
  map,
  of,
  switchMap,
  take,
  withLatestFrom,
  filter,
} from 'rxjs';

import { toApiErrorMessage } from '../../../api/http-error-message.util';
import { selectFavoriteIds } from '../../favorites/store/favorites.selectors';
import { ListingsApiService } from '../services/listings-api.service';
import * as ListingsActions from './listings.actions';
import {
  selectListingsFilters,
  selectListingsHasMore,
  selectListingsOriginCoords,
  selectListingsPage,
  selectListingsPageSize,
} from './listings.selectors';

function toErrorMessage(error: unknown): string {
  return toApiErrorMessage(error);
}

@Injectable()
export class ListingsEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly listingsApi = inject(ListingsApiService);

  readonly loadListings$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ListingsActions.loadListings),
      withLatestFrom(
        this.store.select(selectListingsFilters),
        this.store.select(selectListingsPageSize),
        this.store.select(selectListingsOriginCoords),
      ),
      switchMap(([, filters, pageSize, originCoords]) =>
        this.listingsApi.getListings(filters, 1, pageSize, originCoords).pipe(
          map((result) =>
            ListingsActions.loadListingsSuccess({
              items: result.items,
              page: result.page,
              pageSize: result.pageSize,
              hasMore: result.hasMore,
            }),
          ),
          catchError((error: unknown) =>
            of(
              ListingsActions.loadListingsFailure({
                error: toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly loadNextPage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ListingsActions.loadNextPage),
      withLatestFrom(
        this.store.select(selectListingsHasMore),
        this.store.select(selectListingsPage),
        this.store.select(selectListingsFilters),
        this.store.select(selectListingsPageSize),
        this.store.select(selectListingsOriginCoords),
      ),
      filter(([, hasMore]) => hasMore),
      switchMap(([, , page, filters, pageSize, originCoords]) =>
        this.listingsApi.getListings(filters, page + 1, pageSize, originCoords).pipe(
          map((result) =>
            ListingsActions.loadListingsSuccess({
              items: result.items,
              page: result.page,
              pageSize: result.pageSize,
              hasMore: result.hasMore,
            }),
          ),
          catchError((error: unknown) =>
            of(
              ListingsActions.loadListingsFailure({
                error: toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly loadMapPins$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ListingsActions.loadMapPins),
      withLatestFrom(
        this.store.select(selectListingsFilters),
        this.store.select(selectListingsOriginCoords),
      ),
      // switchMap (not mergeMap/concatMap): the map re-dispatches on every
      // pan/zoom, so a stale in-flight viewport response must be cancelled,
      // not raced against a newer one.
      switchMap(([{ bounds }, filters, originCoords]) =>
        this.listingsApi.getMapPins(filters, bounds, originCoords).pipe(
          map((result) => ListingsActions.loadMapPinsSuccess({ result })),
          catchError((error: unknown) =>
            of(
              ListingsActions.loadMapPinsFailure({
                error: toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly loadListingDetails$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ListingsActions.loadListingDetails),
      switchMap(({ id }) =>
        this.listingsApi.getListingById(id).pipe(
          map((listing) =>
            ListingsActions.loadListingDetailsSuccess({ listing }),
          ),
          catchError((error: unknown) =>
            of(
              ListingsActions.loadListingDetailsFailure({
                error: toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly persistFavoriteToggle$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ListingsActions.toggleFavoriteOptimistic),
      concatMap(({ listingId }) =>
        this.store.select(selectFavoriteIds).pipe(
          take(1),
          switchMap((favoriteIds) => {
            const nowFavorited = favoriteIds.has(listingId);
            const request$ = nowFavorited
              ? this.listingsApi.addToFavorites(listingId)
              : this.listingsApi.removeFromFavorites(listingId);
            return request$.pipe(
              switchMap(() => EMPTY),
              catchError(() =>
                of(
                  ListingsActions.toggleFavoriteRollback({
                    listingId,
                    isFavorite: !nowFavorited,
                  }),
                ),
              ),
            );
          }),
        ),
      ),
    ),
  );

  readonly loadListingCategories$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ListingsActions.loadListingCategories),
      switchMap(() =>
        this.listingsApi.getListingCategories().pipe(
          map((categories) =>
            ListingsActions.loadListingCategoriesSuccess({ categories }),
          ),
          catchError((error: unknown) =>
            of(
              ListingsActions.loadListingCategoriesFailure({
                error: toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly createListing$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ListingsActions.createListing),
      concatMap(({ payload, files }) =>
        this.listingsApi.createListing(payload).pipe(
          switchMap((response) => {
            if (files.length === 0) {
              return of(
                ListingsActions.createListingSuccess({
                  response,
                  imageUploadError: null,
                }),
              );
            }

            // Image upload failure must NOT prevent success/redirect — the
            // listing was already created on the backend. Stream progress
            // actions, then capture any error as a non-blocking warning so the
            // user is still redirected to My Toys (and can retry the upload).
            return this.listingsApi.uploadListingImages(response.id, files).pipe(
              map((event) =>
                event.kind === 'progress'
                  ? ListingsActions.setImageUploadProgress({
                      progress: event.percent,
                    })
                  : ListingsActions.createListingSuccess({
                      response,
                      imageUploadError: null,
                    }),
              ),
              catchError((err: unknown) =>
                of(
                  ListingsActions.createListingSuccess({
                    response,
                    imageUploadError: toErrorMessage(err),
                  }),
                ),
              ),
            );
          }),
          catchError((error: unknown) =>
            // Only listing-creation failures reach this branch.
            of(
              ListingsActions.createListingFailure({
                error: toErrorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly retryImageUpload$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ListingsActions.retryImageUpload),
      concatMap(({ listingId, files }) =>
        this.listingsApi.uploadListingImages(listingId, files).pipe(
          map((event) =>
            event.kind === 'progress'
              ? ListingsActions.setImageUploadProgress({
                  progress: event.percent,
                })
              : ListingsActions.retryImageUploadSuccess(),
          ),
          catchError((err: unknown) =>
            of(
              ListingsActions.retryImageUploadFailure({
                error: toErrorMessage(err),
              }),
            ),
          ),
        ),
      ),
    ),
  );
}
