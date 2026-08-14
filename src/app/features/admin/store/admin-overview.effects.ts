import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, of, switchMap } from 'rxjs';

import { toApiErrorMessage } from '../../../api/http-error-message.util';
import { AdminOverviewApiService } from '../services/admin-overview-api.service';
import * as AdminOverviewActions from './admin-overview.actions';

function toErrorMessage(error: unknown): string {
  return toApiErrorMessage(error);
}

@Injectable()
export class AdminOverviewEffects {
  private readonly actions$ = inject(Actions);
  private readonly overviewApi = inject(AdminOverviewApiService);

  // ── Overview (stat tiles / CTA / shell rail + queue-health panel) ──
  readonly loadOverview$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminOverviewActions.loadOverview),
      switchMap(() =>
        this.overviewApi.getOverview().pipe(
          map((overview) => AdminOverviewActions.loadOverviewSuccess({ overview })),
          catchError((error: unknown) =>
            of(AdminOverviewActions.loadOverviewFailure({ error: toErrorMessage(error) })),
          ),
        ),
      ),
    ),
  );

  // ── Recent moderation activity feed ──
  readonly loadActivityFeed$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AdminOverviewActions.loadActivityFeed),
      switchMap(({ params }) =>
        this.overviewApi.getActivityFeed(params).pipe(
          map((feed) => AdminOverviewActions.loadActivityFeedSuccess({ feed })),
          catchError((error: unknown) =>
            of(AdminOverviewActions.loadActivityFeedFailure({ error: toErrorMessage(error) })),
          ),
        ),
      ),
    ),
  );
}
