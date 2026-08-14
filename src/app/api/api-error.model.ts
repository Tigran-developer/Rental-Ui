import { HttpErrorResponse } from '@angular/common/http';

/**
 * Known `ServiceError` codes, hand-enumerated from the private `ErrorCodes` classes in
 * `rental-api/src/RentalPlatform.Application/Services/*.cs` (AdminListingsService,
 * AuthService, BookingsService, ChatService, FavoritesService, ListingImagesOwnerService,
 * ListingsOwnerService, NotificationsService, ReviewsService). Nothing on the backend
 * exports these today, so this list is NOT generated — re-grep
 * `private static class ErrorCodes` across that folder when a backend PR adds/renames a
 * code, and update this list in the same change.
 *
 * Deliberately a *widened* literal union (`KnownApiErrorCode | (string & {})`, exported as
 * `ApiErrorCode`) rather than a closed union: `errorCode` is a live wire value produced by
 * a backend this file cannot see at compile time. A closed union would make an
 * un-synced-yet backend code a silent type error (or force an `as` cast at every read
 * site) instead of the drift being visible here, in the one file whose job is to track
 * it. The widened form still gives IDE autocomplete + a canonical list to diff against,
 * without lying about exhaustiveness.
 */
export type KnownApiErrorCode =
  // admin.* — AdminListingsService
  | 'admin.unauthenticated'
  | 'admin.forbidden'
  | 'admin.listing_not_found'
  | 'admin.invalid_listing_status'
  // 400. Not yet listed here before this sync — found while re-verifying
  // AdminListingsController.FromError alongside the categories work below.
  | 'admin.invalid_reject_reason'
  // admin.category_* — AdminCategoriesService (admin console Phase 2, Categories screen).
  // 404: the {id:guid} route segment doesn't resolve to a category (Update/UpdateVisibility/
  // Delete) — AdminCategoriesController.FromError.
  | 'admin.category_not_found'
  // 400 in BOTH controllers: a category referenced by a REQUEST VALUE (not the route id) doesn't
  // exist — AdminCategoriesController's DELETE `?reassignToCategoryId=`, and reused as-is by
  // AdminListingsController for `PATCH /{id}/category`'s body `categoryId` (the recategorise
  // target). Same code, same 400 status, deliberately shared across both controllers.
  | 'admin.category_reassign_target_not_found'
  | 'admin.category_name_taken'
  | 'admin.category_invalid_name'
  | 'admin.category_invalid_color'
  | 'admin.category_order_mismatch'
  | 'admin.category_reassign_required'
  | 'admin.category_reassign_invalid'
  // admin.user_* — AdminUsersService (admin console Phase 3, Users screen). 404 on GET
  // /{id} and all three mutation routes; the two 400s are Suspend-only — AdminUsersController.
  | 'admin.user_not_found'
  | 'admin.cannot_suspend_self'
  | 'admin.cannot_suspend_admin'
  // admin.report_not_found — AdminReportsService (admin console Phase 4, Reports & flags
  // screen). 404 on GET /{id} and all three triage mutations (resolve/dismiss/reopen); those
  // three are otherwise idempotent 200 no-ops when the report is already in the target state
  // — AdminReportsController.
  | 'admin.report_not_found'
  // admin.report_target_filter_incomplete / admin.report_invalid_target_filter — the Reports
  // queue's optional `targetType`/`targetId` filter (used by the Users screen's
  // `/admin/reports?userId=` deep link, translated client-side to
  // `targetType=User&targetId=<id>`). Both 400 on GET /api/admin/reports: `targetId` supplied
  // without `targetType` is incomplete; a `targetType` that doesn't parse to
  // Listing/User/Message is invalid — AdminReportsController.
  | 'admin.report_target_filter_incomplete'
  | 'admin.report_invalid_target_filter'
  // auth.* — AuthService
  | 'auth.duplicate_email'
  | 'auth.invalid_credentials'
  | 'auth.user_blocked'
  | 'auth.unauthenticated'
  | 'auth.external_provider_unsupported'
  | 'auth.external_invalid_token'
  | 'auth.external_email_missing'
  | 'auth.external_link_conflict'
  // booking.* — BookingsService
  | 'booking.unauthenticated'
  | 'booking.user_blocked'
  | 'booking.listing_not_found'
  | 'booking.listing_not_approved'
  | 'booking.own_listing_forbidden'
  | 'booking.invalid_dates'
  | 'booking.note_too_long'
  | 'booking.overlap'
  | 'booking.not_found'
  | 'booking.forbidden'
  | 'booking.not_pending'
  | 'booking.not_cancellable'
  | 'booking.not_activatable'
  | 'booking.not_completable'
  | 'booking.owner_only'
  // chat.* — ChatService
  | 'chat.unauthenticated'
  | 'chat.user_blocked'
  | 'chat.not_participant'
  | 'chat.conversation_not_found'
  | 'chat.booking_not_found'
  | 'chat.conversation_closed'
  | 'chat.message_too_long'
  | 'chat.attachment_too_large'
  | 'chat.attachment_invalid_type'
  // favorite.* — FavoritesService
  | 'favorite.unauthenticated'
  | 'favorite.user_blocked'
  | 'favorite.listing_not_found'
  // listing.* — ListingsOwnerService + ListingImagesOwnerService (share the "listing." prefix;
  // codes below are de-duplicated where both services define the same string)
  | 'listing.unauthenticated'
  | 'listing.user_blocked'
  | 'listing.not_found'
  | 'listing.forbidden'
  | 'listing.invalid_status'
  | 'listing.category_not_found'
  | 'listing.district_not_found'
  | 'listing.invalid_age_range'
  | 'listing.image_empty'
  | 'listing.image_invalid_type'
  | 'listing.image_too_many'
  | 'listing.image_listing_limit'
  | 'listing.image_too_large'
  | 'listing.image_not_found'
  | 'listing.image_invalid_reorder'
  // notification.* — NotificationsService
  | 'notification.unauthenticated'
  | 'notification.invalid_filter'
  | 'notification.not_found'
  // report.* — ReportsService (admin console Phase 4: user-facing POST /api/reports). Any
  // authenticated, non-blocked user. invalid_reason/invalid_target_type/cannot_report_own are
  // 400; already_reported is 409 (an open report already exists for this reporter+target);
  // target_not_found is 404 — ReportsController.
  | 'report.unauthenticated'
  | 'report.user_blocked'
  | 'report.invalid_reason'
  | 'report.invalid_target_type'
  | 'report.target_not_found'
  | 'report.cannot_report_own'
  | 'report.already_reported'
  // review.* — ReviewsService
  | 'review.unauthenticated'
  | 'review.booking_not_found'
  | 'review.booking_not_completed'
  | 'review.forbidden'
  | 'review.already_submitted';

/**
 * Any `errorCode` the API can send: the known codes above (for autocomplete), widened to
 * accept any string so an un-synced backend code still type-checks. See `KnownApiErrorCode`
 * for why this isn't a closed union.
 */
export type ApiErrorCode = KnownApiErrorCode | (string & {});

/**
 * The RFC 7807 ProblemDetails envelope every controller error response uses — see
 * `rental-api/src/RentalPlatform.Api/Extensions/ServiceErrorProblemDetailsExtensions.cs`
 * (`ToProblemDetails`), which all 8 API controllers call.
 *
 * ```json
 * {
 *   "type": "urn:rental:error:listing.image_invalid_type",
 *   "title": "<human-readable message>",
 *   "status": 400,
 *   "errorCode": "listing.image_invalid_type"
 * }
 * ```
 *
 * IMPORTANT: `type` is a stable, non-dereferenceable URN (`urn:rental:error:<code>`) —
 * RFC 7807 requires `type` to be a URI reference, so the backend puts it there in URN
 * form and NOT as the bare code. Do not parse `type` for the error code (a prior version
 * of this contract did exactly that by convention with nothing written down — that is the
 * bug this type exists to prevent). Read `errorCode` instead.
 */
export interface ApiProblemDetails {
  /** RFC 7807 URI reference: `urn:rental:error:<code>`. NOT the place to read the code from. */
  type?: string;
  /** `ServiceError.Message` — human-readable, English-only, not localized. */
  title?: string;
  /** HTTP status code, duplicated from the response status line. */
  status?: number;
  /** Present on ASP.NET's default validation ProblemDetails (model-binding failures). */
  detail?: string;
  instance?: string;
  /**
   * The bare, stable `ServiceError` code (e.g. `"listing.image_invalid_type"`). THIS is the
   * member to branch on for a specific server error — never `type`.
   */
  errorCode?: ApiErrorCode;
  /** ASP.NET validation ProblemDetails also carries this map, keyed by field name. */
  errors?: Record<string, string[]>;
}

/**
 * Safely read `errorCode` off an `HttpErrorResponse`, or `null` if the error isn't shaped
 * like an `ApiProblemDetails` (network failure, non-JSON body, etc.). Prefer this over
 * reaching into `error.error.type` — see `ApiProblemDetails` for why.
 */
export function getApiErrorCode(error: unknown): ApiErrorCode | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const body: unknown = error.error;
  if (
    typeof body === 'object' &&
    body !== null &&
    'errorCode' in body &&
    typeof (body as { errorCode: unknown }).errorCode === 'string'
  ) {
    return (body as { errorCode: string }).errorCode;
  }
  return null;
}
