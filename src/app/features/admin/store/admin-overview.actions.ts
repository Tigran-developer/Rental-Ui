import { createAction, props } from '@ngrx/store';

import type {
  AdminActivityFeed,
  AdminActivityFeedParams,
  AdminOverview,
} from '../models/admin-overview.model';

// ── Overview (stat tiles / CTA / shell rail + queue-health panel) ─────────
export const loadOverview = createAction('[Admin Overview] Load Overview');

export const loadOverviewSuccess = createAction(
  '[Admin Overview] Load Overview Success',
  props<{ overview: AdminOverview }>(),
);

export const loadOverviewFailure = createAction(
  '[Admin Overview] Load Overview Failure',
  props<{ error: string }>(),
);

// ── Recent moderation activity feed ────────────────────────────────────────
export const loadActivityFeed = createAction(
  '[Admin Overview] Load Activity Feed',
  props<{ params?: AdminActivityFeedParams }>(),
);

export const loadActivityFeedSuccess = createAction(
  '[Admin Overview] Load Activity Feed Success',
  props<{ feed: AdminActivityFeed }>(),
);

export const loadActivityFeedFailure = createAction(
  '[Admin Overview] Load Activity Feed Failure',
  props<{ error: string }>(),
);
