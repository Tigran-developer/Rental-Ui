/**
 * Structured community-report reasons for POST /api/reports body.reasonCode — the renter/owner-
 * facing report dialog's reason picker. Lives here (not under `admin/`) because the reason
 * catalog is a property of the Report entity itself, the same "core type lives in its natural
 * feature, admin imports it" pattern `admin/models/admin-report.model.ts` already uses for
 * `ReportTargetType`/`ReportSeverity`/`ReportStatus` — the admin Reports queue imports
 * `REPORT_REASONS`/`reportReasonLabelKey` from here to render each row's reason, it does not own
 * them. Single source of truth on the frontend — codes must stay in sync with
 * `ReportReasonCatalog` (rental-api `Application/Common/ReportReasonCatalog.cs`);
 * titles/descriptions live in i18n under `reports.reasons.<key>` (label) — same split as
 * `admin/models/reject-reason.model.ts`'s `REJECT_REASONS`, and for the same reason:
 * `ReportReasonCatalog` also carries a `Severity` per reason, but that is derived server-side and
 * never sent back as part of the catalog, so it isn't modelled here either.
 */
export interface ReportReason {
  readonly key: string;
  readonly icon: string;
}

export const REPORT_REASONS: readonly ReportReason[] = [
  { key: 'noShow', icon: 'pi pi-user-minus' },
  { key: 'unsafeItem', icon: 'pi pi-exclamation-triangle' },
  { key: 'misleadingPhotos', icon: 'pi pi-image' },
  { key: 'offPlatformPayment', icon: 'pi pi-wallet' },
  { key: 'rudeMessages', icon: 'pi pi-comment' },
  { key: 'spam', icon: 'pi pi-ban' },
  { key: 'other', icon: 'pi pi-question-circle' },
];

const REPORT_REASON_KEYS = new Set(REPORT_REASONS.map((reason) => reason.key));

/**
 * The admin Reports queue and the report-detail dialog both need to render a row's
 * `reasonCode` (a bare wire string) as translated copy. Returns the `reports.reasons.<code>.label`
 * i18n key when `code` is one of the 7 catalog codes, or `null` for anything else (a reason
 * code added to the backend catalog but not yet synced here) — callers fall back to rendering
 * the raw code in that case rather than a missing-translation-key placeholder.
 */
export function reportReasonLabelKey(code: string): string | null {
  return REPORT_REASON_KEYS.has(code) ? `reports.reasons.${code}.label` : null;
}
