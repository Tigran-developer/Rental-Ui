/**
 * Admin console Phase 4: the community-report entity itself — the "Report" action a renter or
 * owner takes against a listing, a user, or a message. This is deliberately its own top-level
 * feature (not nested under `admin/`, not owned by `listings/` or `public-profiles/`): a Report
 * can be filed from listing details, a public profile, or a chat thread, so it is a cross-cutting
 * concern the same way `reviews/` and `favorites/` are — several unrelated features trigger it,
 * none of them owns it. `features/admin/models/admin-report.model.ts` imports the enum types
 * below for the admin triage queue, the same "core type lives in its natural feature, admin
 * imports it" pattern `admin-listing-queue.model.ts` already uses for `ToyCondition`.
 *
 * Mirrors `ReportResponse` / `CreateReportRequest` (rental-api `Application/DTOs/*.cs`) and the
 * `ReportTargetType` / `ReportSeverity` / `ReportStatus` enums (`Domain/Enums/*.cs`), all
 * serialized as strings by the global `JsonStringEnumConverter`.
 */

/**
 * The target-type casing ASYMMETRY, verified against `ReportsService.ParseTargetType` and
 * `ReportResponse.TargetType`:
 *  - REQUEST (`CreateReportRequest.TargetType`) is a loose, case-insensitive string
 *    ("listing" | "user" | "message") parsed by `ReportsService`, same convention as
 *    `AdminListingQueueFilter.Status` — see `ReportTargetTypeRequest` below. Anything else
 *    (including null/empty) is rejected with `report.invalid_target_type`; there is no default.
 *  - RESPONSE (`ReportResponse.TargetType`, and `AdminReportRowResponse.TargetType`) is the
 *    domain `ReportTargetType` enum, so it comes back PascalCase ("Listing" | "User" | "Message")
 *    via the global `JsonStringEnumConverter` — see `ReportTargetType` below.
 * Do not conflate the two: sending "Listing" (PascalCase) in a request body still works today
 * only because the backend lower-cases before matching, but that's an implementation detail of
 * `ParseTargetType`, not a documented contract — always send the lowercase form.
 */
export type ReportTargetTypeRequest = 'listing' | 'user' | 'message';

/** The response-side enum string. See the casing-asymmetry note above `ReportTargetTypeRequest`. */
export type ReportTargetType = 'Listing' | 'User' | 'Message';

/**
 * Urgency of a report. Derived server-side from `reasonCode` (`ReportReasonCatalog.SeverityFor`)
 * — never client-supplied, so `CreateReportRequest` has no severity field at all.
 */
export type ReportSeverity = 'Low' | 'Medium' | 'High';

/** Triage state of a report. */
export type ReportStatus = 'Open' | 'Resolved' | 'Dismissed';

/** POST /api/reports body. */
export interface CreateReportRequest {
  readonly targetType: ReportTargetTypeRequest;
  readonly targetId: string;
  readonly reasonCode: string;
  readonly detail?: string | null;
}

/** The created report, returned 201 from POST /api/reports. Mirrors `ReportResponse`. */
export interface Report {
  readonly id: string;
  readonly targetType: ReportTargetType;
  readonly targetId: string;
  readonly targetLabel: string;
  readonly reasonCode: string;
  readonly detail: string | null;
  readonly severity: ReportSeverity;
  readonly status: ReportStatus;
  readonly createdAt: string;
}
