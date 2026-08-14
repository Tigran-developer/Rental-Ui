import { createAction, props } from '@ngrx/store';

import type {
  AdminReportQueue,
  AdminReportQueueStatusFilter,
  AdminReportRow,
} from '../models/admin-report.model';
import type { AdminReportsTargetFilter } from './admin-reports.state';

// ── Queue (reports-page tabs: Open / Resolved / Dismissed / All) ──────────
export const loadReportQueue = createAction('[Admin Reports] Load Report Queue');

export const loadReportQueueSuccess = createAction(
  '[Admin Reports] Load Report Queue Success',
  props<{ queue: AdminReportQueue }>(),
);

export const loadReportQueueFailure = createAction(
  '[Admin Reports] Load Report Queue Failure',
  props<{ error: string }>(),
);

export const setReportStatusFilter = createAction(
  '[Admin Reports] Set Status Filter',
  props<{ status: AdminReportQueueStatusFilter }>(),
);

export const setReportSearch = createAction(
  '[Admin Reports] Set Search',
  props<{ search: string }>(),
);

/** `null` clears the filter — the "Show all reports" affordance on the filtered-banner. */
export const setReportTargetFilter = createAction(
  '[Admin Reports] Set Target Filter',
  props<{ targetFilter: AdminReportsTargetFilter | null }>(),
);

export const setReportPage = createAction('[Admin Reports] Set Page', props<{ page: number }>());

// ── Resolve (optimistic: reducer patches status immediately) ──────────────
export const resolveReport = createAction(
  '[Admin Reports] Resolve Report',
  props<{ reportId: string; note?: string }>(),
);

export const resolveReportSuccess = createAction(
  '[Admin Reports] Resolve Report Success',
  props<{ reportId: string; report: AdminReportRow }>(),
);

export const resolveReportFailure = createAction(
  '[Admin Reports] Resolve Report Failure',
  props<{ reportId: string; error: string; errorCode: string | null }>(),
);

// ── Dismiss (optimistic) ───────────────────────────────────────────────────
export const dismissReport = createAction(
  '[Admin Reports] Dismiss Report',
  props<{ reportId: string; note?: string }>(),
);

export const dismissReportSuccess = createAction(
  '[Admin Reports] Dismiss Report Success',
  props<{ reportId: string; report: AdminReportRow }>(),
);

export const dismissReportFailure = createAction(
  '[Admin Reports] Dismiss Report Failure',
  props<{ reportId: string; error: string; errorCode: string | null }>(),
);

// ── Reopen (optimistic) ─────────────────────────────────────────────────────
export const reopenReport = createAction(
  '[Admin Reports] Reopen Report',
  props<{ reportId: string }>(),
);

export const reopenReportSuccess = createAction(
  '[Admin Reports] Reopen Report Success',
  props<{ reportId: string; report: AdminReportRow }>(),
);

export const reopenReportFailure = createAction(
  '[Admin Reports] Reopen Report Failure',
  props<{ reportId: string; error: string; errorCode: string | null }>(),
);
