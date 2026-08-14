import { createAction, props } from '@ngrx/store';

import type {
  AdminUser,
  AdminUserQueue,
  AdminUserSortOption,
  AdminUserStatusFilter,
} from '../models/admin-user.model';

// ── Queue (users-page tabs: All / Pending ID / Suspended) ─────────────────
export const loadUserQueue = createAction('[Admin Users] Load User Queue');

export const loadUserQueueSuccess = createAction(
  '[Admin Users] Load User Queue Success',
  props<{ queue: AdminUserQueue }>(),
);

export const loadUserQueueFailure = createAction(
  '[Admin Users] Load User Queue Failure',
  props<{ error: string }>(),
);

export const setUserStatusFilter = createAction(
  '[Admin Users] Set Status Filter',
  props<{ status: AdminUserStatusFilter }>(),
);

export const setUserSearch = createAction('[Admin Users] Set Search', props<{ search: string }>());

export const setUserSort = createAction(
  '[Admin Users] Set Sort',
  props<{ sort: AdminUserSortOption }>(),
);

export const setUserPage = createAction('[Admin Users] Set Page', props<{ page: number }>());

// ── Verify (optimistic: reducer patches isIdConfirmed/status immediately) ──
export const verifyUser = createAction('[Admin Users] Verify User', props<{ userId: string }>());

export const verifyUserSuccess = createAction(
  '[Admin Users] Verify User Success',
  props<{ userId: string; user: AdminUser }>(),
);

export const verifyUserFailure = createAction(
  '[Admin Users] Verify User Failure',
  props<{ userId: string; error: string; errorCode: string | null }>(),
);

// ── Suspend (optimistic) ────────────────────────────────────────────────
export const suspendUser = createAction('[Admin Users] Suspend User', props<{ userId: string }>());

export const suspendUserSuccess = createAction(
  '[Admin Users] Suspend User Success',
  props<{ userId: string; user: AdminUser }>(),
);

export const suspendUserFailure = createAction(
  '[Admin Users] Suspend User Failure',
  props<{ userId: string; error: string; errorCode: string | null }>(),
);

// ── Reactivate (optimistic) ─────────────────────────────────────────────
export const reactivateUser = createAction(
  '[Admin Users] Reactivate User',
  props<{ userId: string }>(),
);

export const reactivateUserSuccess = createAction(
  '[Admin Users] Reactivate User Success',
  props<{ userId: string; user: AdminUser }>(),
);

export const reactivateUserFailure = createAction(
  '[Admin Users] Reactivate User Failure',
  props<{ userId: string; error: string; errorCode: string | null }>(),
);
