/**
 * Admin console Phase 5: the Overview screen (stat tiles, "Queue health" panel, recent-activity
 * feed). Mirrors `AdminOverviewResponse` / `AdminActivityFeedResponse` (rental-api
 * `Application/DTOs/Admin*.cs`) and the `ModerationAction` / `ModerationTargetType` enums
 * (`Domain/Enums/*.cs`), serialized as strings by the global `JsonStringEnumConverter`. No
 * display strings come from the server — the client composes the feed line from
 * `action` + `targetLabel` + `detailJson`; dates/durations arrive as raw values (ISO string /
 * minutes), not pre-formatted ("2d ago", "3.2 h") — humanising and localising is the client's job.
 */

/**
 * Every action recorded in the moderation audit trail. Left as a widened union
 * (`KnownModerationAction | (string & {})`), NOT a closed union with a coercion fallback —
 * deliberately different from `ReportTargetType`/`ReportSeverity`/`ReportStatus` below and in
 * `admin-report.model.ts`, which DO get closed unions + a coerced default. Reasoning: this value
 * is consumed purely as an i18n lookup key when the client composes the feed line (see the file
 * header above) — the template already needs an "unknown action" fallback branch for that
 * lookup regardless, so inventing a fake enum member here to force a closed union would just
 * duplicate that fallback with a misleading answer (e.g. silently reporting "ListingApproved"
 * for a row that was actually some future action this build doesn't know about yet). Passing the
 * raw string through and letting the one real call site handle "unrecognised" is the same
 * judgment call already made for `ApiErrorCode` in `api-error.model.ts`, for the same reason:
 * a value this file cannot see at compile time, safest kept as reported rather than mapped.
 */
export type KnownModerationAction =
  | 'ListingApproved'
  | 'ListingRejected'
  | 'ListingRecategorised'
  | 'CategoryCreated'
  | 'CategoryRenamed'
  | 'CategoryReordered'
  | 'CategoryVisibilityChanged'
  | 'CategoryDeleted'
  | 'UserVerified'
  | 'UserSuspended'
  | 'UserReactivated'
  | 'ReportResolved'
  | 'ReportDismissed'
  | 'ReportReopened';

export type ModerationAction = KnownModerationAction | (string & {});

/**
 * What kind of entity a `ModerationLogEntry` is about. Unlike `ModerationAction` above, this
 * DOES get a closed union + coerced fallback (see `AdminOverviewApiService.coerceModerationTargetType`)
 * — same reasoning as `ReportTargetType`: it plausibly drives per-type rendering (an icon, a
 * link target) rather than only an opaque i18n key, so a wrong-but-valid value is safer than an
 * arbitrary passthrough string reaching that branching logic.
 */
export type ModerationTargetType = 'Listing' | 'Category' | 'User' | 'Report';

/**
 * The Overview screen's stat tiles + "Queue health" panel. Every number is computed straight
 * from the database — never a placeholder. Mirrors `AdminOverviewResponse`.
 */
export interface AdminOverview {
  /** Listings currently in PendingApproval. */
  awaitingReviewCount: number;
  /** CreatedAt of the oldest PendingApproval listing; null when the queue is empty. */
  oldestAwaitingCreatedAt: string | null;
  /** Listings currently Approved. */
  liveListingCount: number;
  /**
   * Listings that became Approved (ModeratedAt, not CreatedAt — "added to the marketplace"
   * means approved, not submitted) in the trailing 7 days.
   */
  liveListingsAddedThisWeek: number;
  categoryCount: number;
  visibleCategoryCount: number;
  /** Reports currently Open. */
  openReportCount: number;
  /**
   * Mean of (ModeratedAt - CreatedAt), in minutes, across listings moderated (approved or
   * rejected) in the trailing 30 days. `null` means "nothing was moderated in that window" —
   * NOT the same as `0` ("everything moderated in that window was instantaneous"). Keep these
   * distinct when rendering: null should read as "no data yet," not "0 minutes."
   */
  averageReviewTimeMinutes: number | null;
  /**
   * The "target < 6 h" line on the Queue health panel — served from the same named constant the
   * server itself would alert against, so the client never hardcodes it.
   */
  reviewTimeTargetHours: number;
}

/**
 * One `ModerationLogEntry` row. `actorFirstName`/`actorLastName`/`actorAvatarUrl` are null when
 * the actor user row no longer exists (deleted account); the row itself is still returned
 * (`actorId`, `action`, `targetLabel`, etc. survive) so the audit trail never develops a hole —
 * do not filter these rows out when normalising the feed.
 */
export interface AdminActivityItem {
  id: string;
  action: ModerationAction;
  targetType: ModerationTargetType;
  targetId: string;
  targetLabel: string;
  createdAt: string;

  actorId: string;
  actorFirstName: string | null;
  actorLastName: string | null;
  actorAvatarUrl: string | null;

  detailJson: string | null;
}

/** GET /api/admin/overview/activity, newest first. Mirrors `AdminActivityFeedResponse`. */
export interface AdminActivityFeed {
  items: AdminActivityItem[];
}

/** `take` defaults to 20 server-side and is clamped to 50 — the client need not pre-clamp it. */
export interface AdminActivityFeedParams {
  take?: number;
}
