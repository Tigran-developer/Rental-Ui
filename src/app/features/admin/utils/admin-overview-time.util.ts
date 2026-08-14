/**
 * Compact relative time ("2m ago", "5h ago", "3d ago") for the Overview screen — the "oldest
 * {{value}} ago" stat sub-line and the recent-moderation feed's timestamps. Same `{ key, params
 * }` shape `TranslatePipe` takes directly as `admin-report-time.util.ts` (`reportRelativeTime`),
 * reimplemented here rather than importing that one so the Overview screen owns its own
 * `admin.overview.time.*` keys — same reasoning as that file's own doc comment.
 *
 * Extends past the one-week cutoff `reportRelativeTime` falls back to an absolute date at:
 * a pending listing can plausibly sit in the queue (or a feed row can plausibly be old) for
 * weeks/months if something is stuck, and "oldest {{value}} ago" reads better as a relative
 * duration than a bare calendar date in that context. Caps at years so an absurd/garbage
 * timestamp still renders something sane instead of "NaN ago".
 */
export interface OverviewRelativeTimeDisplay {
  readonly key: string;
  readonly params: Record<string, number>;
}

const MINUTE = 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const WEEK = DAY * 7;
const MONTH = DAY * 30;
const YEAR = DAY * 365;

/** `null`/empty/unparseable input degrades to "just now" rather than throwing or rendering
 *  "NaN ago" — callers only reach this with a value they already know is non-null (see
 *  `oldestAwaitingCreatedAt`'s own null check upstream), but a raw ISO string from the network
 *  is never fully trustworthy. */
export function overviewRelativeTime(
  dateIso: string | null | undefined,
): OverviewRelativeTimeDisplay {
  const then = dateIso ? new Date(dateIso).getTime() : NaN;
  if (!dateIso || Number.isNaN(then)) {
    return { key: 'admin.overview.time.justNow', params: {} };
  }

  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));

  if (diffSec < MINUTE) return { key: 'admin.overview.time.justNow', params: {} };
  if (diffSec < HOUR) {
    return {
      key: 'admin.overview.time.minutesAgo',
      params: { value: Math.floor(diffSec / MINUTE) },
    };
  }
  if (diffSec < DAY) {
    return { key: 'admin.overview.time.hoursAgo', params: { value: Math.floor(diffSec / HOUR) } };
  }
  if (diffSec < WEEK) {
    return { key: 'admin.overview.time.daysAgo', params: { value: Math.floor(diffSec / DAY) } };
  }
  if (diffSec < MONTH) {
    return { key: 'admin.overview.time.weeksAgo', params: { value: Math.floor(diffSec / WEEK) } };
  }
  if (diffSec < YEAR) {
    return { key: 'admin.overview.time.monthsAgo', params: { value: Math.floor(diffSec / MONTH) } };
  }
  return { key: 'admin.overview.time.yearsAgo', params: { value: Math.floor(diffSec / YEAR) } };
}
