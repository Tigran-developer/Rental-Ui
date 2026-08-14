/**
 * Compact relative time ("2m ago", "5h ago", "3d ago") for a report's `createdAt`, in the
 * `{ key, params }` shape `TranslatePipe` takes directly (`{{ relativeTimeKey | translate:
 * relativeTimeParams }}`) — same logic as `features/notifications/pipes/time-ago.pipe.ts`,
 * reimplemented here (rather than importing that pipe cross-feature) so the reports screen
 * owns its own `admin.reports.time.*` translation keys instead of borrowing notifications'.
 * Anything older than a week falls back to an absolute short date, which needs no i18n key at
 * all — `toLocaleDateString` already localizes it.
 */
export interface RelativeTimeDisplay {
  readonly key: string | null;
  readonly params?: Record<string, number>;
  /** Set only for the "older than a week" fallback — an already-formatted absolute date, to
   *  render verbatim instead of translating. */
  readonly absolute?: string;
}

export function reportRelativeTime(createdAt: string): RelativeTimeDisplay {
  const then = new Date(createdAt).getTime();
  if (!createdAt || Number.isNaN(then)) {
    return { key: null };
  }

  const diffMs = Date.now() - then;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSec < 60) {
    return { key: 'admin.reports.time.justNow' };
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return { key: 'admin.reports.time.minutesAgo', params: { value: diffMin } };
  }
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return { key: 'admin.reports.time.hoursAgo', params: { value: diffHour } };
  }
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) {
    return { key: 'admin.reports.time.daysAgo', params: { value: diffDay } };
  }

  return {
    key: null,
    absolute: new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
  };
}
