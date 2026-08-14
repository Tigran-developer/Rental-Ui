/**
 * Composes one "Recent moderation" feed row (`AdminOverviewDesktop`'s activity list) from the
 * raw `AdminActivityItem` the server sends — the server has no display strings (see
 * `admin-overview.model.ts`'s file header), so all of this — actor name fallback, the tone
 * colour, the sentence, and the secondary detail line — is composed client-side.
 */
import type { KnownModerationAction, ModerationAction } from '../models/admin-overview.model';

export type ActivityTone = 'success' | 'danger' | 'info' | 'neutral';

/** One line key per `KnownModerationAction`, each a full sentence template taking `{{actor}}`
 *  and `{{target}}` params — full sentences (not a shared "{{actor}} {{verb}} {{target}}"
 *  skeleton) because word order/agreement around the verb differs across en/ru/hy. */
const ACTION_LINE_KEYS: Record<KnownModerationAction, string> = {
  ListingApproved: 'admin.overview.activity.lines.ListingApproved',
  ListingRejected: 'admin.overview.activity.lines.ListingRejected',
  ListingRecategorised: 'admin.overview.activity.lines.ListingRecategorised',
  CategoryCreated: 'admin.overview.activity.lines.CategoryCreated',
  CategoryRenamed: 'admin.overview.activity.lines.CategoryRenamed',
  CategoryReordered: 'admin.overview.activity.lines.CategoryReordered',
  CategoryVisibilityChanged: 'admin.overview.activity.lines.CategoryVisibilityChanged',
  CategoryDeleted: 'admin.overview.activity.lines.CategoryDeleted',
  UserVerified: 'admin.overview.activity.lines.UserVerified',
  UserSuspended: 'admin.overview.activity.lines.UserSuspended',
  UserReactivated: 'admin.overview.activity.lines.UserReactivated',
  ReportResolved: 'admin.overview.activity.lines.ReportResolved',
  ReportDismissed: 'admin.overview.activity.lines.ReportDismissed',
  ReportReopened: 'admin.overview.activity.lines.ReportReopened',
};

const ACTION_TONES: Record<KnownModerationAction, ActivityTone> = {
  ListingApproved: 'success',
  ListingRejected: 'danger',
  ListingRecategorised: 'info',
  CategoryCreated: 'success',
  CategoryRenamed: 'info',
  CategoryReordered: 'info',
  CategoryVisibilityChanged: 'info',
  CategoryDeleted: 'danger',
  UserVerified: 'success',
  UserSuspended: 'danger',
  UserReactivated: 'success',
  ReportResolved: 'success',
  ReportDismissed: 'neutral',
  ReportReopened: 'info',
};

const GENERIC_LINE_KEY = 'admin.overview.activity.lines.generic';

function isKnownAction(action: ModerationAction): action is KnownModerationAction {
  return Object.prototype.hasOwnProperty.call(ACTION_LINE_KEYS, action);
}

/** The i18n key for the composed sentence — an unrecognised (future/widened-union) action
 *  string falls back to a generic line rather than rendering a raw enum-ish key or crashing. */
export function activityLineKey(action: ModerationAction): string {
  return isKnownAction(action) ? ACTION_LINE_KEYS[action] : GENERIC_LINE_KEY;
}

/** Sensible neutral tone for an unrecognised action — same fallback judgment as
 *  `activityLineKey`. */
export function activityTone(action: ModerationAction): ActivityTone {
  return isKnownAction(action) ? ACTION_TONES[action] : 'neutral';
}

/**
 * `${firstName} ${lastName}`.trim(), or a translated "Removed moderator" fallback when both are
 * null (the actor's user row was deleted — see `AdminActivityItem`'s doc comment). The row
 * itself always renders; this only ever affects the name shown for it.
 */
export function activityActorDisplay(
  firstName: string | null,
  lastName: string | null,
): { name: string; isFallback: true } | { name: string; isFallback: false } {
  const name = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  if (name.length > 0) return { name, isFallback: false };
  return { name: 'admin.overview.activity.removedActor', isFallback: true };
}

export interface RecategoriseDetail {
  readonly fromCategory: string;
  readonly toCategory: string;
}

/**
 * Defensively parses the `{"fromCategory":"...","toCategory":"..."}` shape
 * `AdminListingsService` serializes into `DetailJson` for `ListingRecategorised` (see backend
 * `AdminListingsService.cs`). Malformed JSON, an unexpected shape, or a null/absent string all
 * degrade to `null` — never throw — so the feed row still renders its plain line.
 */
export function parseRecategoriseDetail(detailJson: string | null): RecategoriseDetail | null {
  if (!detailJson) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(detailJson);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const fromCategory = obj['fromCategory'];
  const toCategory = obj['toCategory'];
  if (typeof fromCategory !== 'string' || typeof toCategory !== 'string') return null;
  if (fromCategory.length === 0 || toCategory.length === 0) return null;
  return { fromCategory, toCategory };
}

export interface RejectDetail {
  readonly reasonCode: string;
}

/**
 * Defensively parses the `{"reasonCode":"...","note":"..."}` shape `AdminListingsService`
 * serializes into `DetailJson` for `ListingRejected`. Only `reasonCode` is surfaced (it maps to
 * the same `admin.pendingListings.rejectSheet.reasons.<code>.title` keys the reject panel
 * already uses) — same defensive contract as `parseRecategoriseDetail`.
 */
export function parseRejectDetail(detailJson: string | null): RejectDetail | null {
  if (!detailJson) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(detailJson);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const reasonCode = (parsed as Record<string, unknown>)['reasonCode'];
  if (typeof reasonCode !== 'string' || reasonCode.length === 0) return null;
  return { reasonCode };
}
