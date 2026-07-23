export interface ListingsFilter {
  query: string | null;
  city: string | null;
  categoryId: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  ageGroup: string | null;
  maxDistance: number | null;
}

/**
 * Renter's device position, used only to compute distance-based sorting/
 * filtering for the current session. Never persisted (not part of
 * `ListingsFilter`, never written to the URL or storage) — session-only,
 * per Maps P2-3.
 */
export interface ListingsOriginCoords {
  lat: number;
  lng: number;
}

/**
 * Month bounds sent to the API for an `ageGroup` token. Single source of
 * truth for the `<from>-<to>` / `<from>+` token shape shared by the
 * `AGE_GROUPS` UI list (listings-page.component.ts) and
 * `ListingsApiService.buildListingsQueryParams()` — keeps the two in
 * agreement without duplicating the mapping.
 */
export interface AgeGroupMonthRange {
  ageFromMonths: number;
  ageToMonths: number | null;
}

const AGE_GROUP_TOKEN_PATTERN = /^(\d+)-(\d+)$/;
const AGE_GROUP_OPEN_ENDED_SUFFIX = '+';

/**
 * Parses an `ageGroup` token (`"0-12"`, `"12-36"`, ..., `"120+"`) into the
 * `ageFromMonths`/`ageToMonths` bounds the API expects. Returns `null` for an
 * unrecognized token so callers can skip emitting the param rather than
 * sending garbage.
 */
export function parseAgeGroupToMonths(token: string): AgeGroupMonthRange | null {
  if (token.endsWith(AGE_GROUP_OPEN_ENDED_SUFFIX)) {
    const from = Number(token.slice(0, -AGE_GROUP_OPEN_ENDED_SUFFIX.length));
    return Number.isFinite(from) ? { ageFromMonths: from, ageToMonths: null } : null;
  }

  const match = AGE_GROUP_TOKEN_PATTERN.exec(token);
  if (!match) {
    return null;
  }

  const ageFromMonths = Number(match[1]);
  const ageToMonths = Number(match[2]);
  if (!Number.isFinite(ageFromMonths) || !Number.isFinite(ageToMonths)) {
    return null;
  }

  return { ageFromMonths, ageToMonths };
}
