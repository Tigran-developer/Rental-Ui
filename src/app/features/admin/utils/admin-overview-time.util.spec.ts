import { overviewRelativeTime } from './admin-overview-time.util';

const MINUTE = 60_000;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const WEEK = DAY * 7;
const MONTH = DAY * 30;
const YEAR = DAY * 365;

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

describe('overviewRelativeTime', () => {
  it('returns justNow for a null/undefined/empty/unparseable value', () => {
    expect(overviewRelativeTime(null)).toEqual({ key: 'admin.overview.time.justNow', params: {} });
    expect(overviewRelativeTime(undefined)).toEqual({
      key: 'admin.overview.time.justNow',
      params: {},
    });
    expect(overviewRelativeTime('')).toEqual({ key: 'admin.overview.time.justNow', params: {} });
    expect(overviewRelativeTime('not-a-date')).toEqual({
      key: 'admin.overview.time.justNow',
      params: {},
    });
  });

  it('returns justNow under a minute', () => {
    expect(overviewRelativeTime(isoAgo(30_000))).toEqual({
      key: 'admin.overview.time.justNow',
      params: {},
    });
  });

  it('returns minutesAgo under an hour', () => {
    expect(overviewRelativeTime(isoAgo(5 * MINUTE))).toEqual({
      key: 'admin.overview.time.minutesAgo',
      params: { value: 5 },
    });
  });

  it('returns hoursAgo under a day', () => {
    expect(overviewRelativeTime(isoAgo(3 * HOUR))).toEqual({
      key: 'admin.overview.time.hoursAgo',
      params: { value: 3 },
    });
  });

  it('returns daysAgo under a week', () => {
    expect(overviewRelativeTime(isoAgo(2 * DAY))).toEqual({
      key: 'admin.overview.time.daysAgo',
      params: { value: 2 },
    });
  });

  it('returns weeksAgo under a month', () => {
    expect(overviewRelativeTime(isoAgo(2 * WEEK))).toEqual({
      key: 'admin.overview.time.weeksAgo',
      params: { value: 2 },
    });
  });

  it('returns monthsAgo under a year', () => {
    expect(overviewRelativeTime(isoAgo(2 * MONTH))).toEqual({
      key: 'admin.overview.time.monthsAgo',
      params: { value: 2 },
    });
  });

  it('returns yearsAgo beyond a year', () => {
    expect(overviewRelativeTime(isoAgo(2 * YEAR))).toEqual({
      key: 'admin.overview.time.yearsAgo',
      params: { value: 2 },
    });
  });
});
