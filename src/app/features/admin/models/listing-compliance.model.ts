/**
 * Derives the three-item compliance checklist (`CheckPill` rows in the
 * design's `AdminReviewDesktop`/`AdminInspectDesktop`) from real listing
 * fields. The backend has no `checks` object (that was mock data in the
 * design file) — this is the single shared source of truth both the review
 * card and the inspect dossier must call, so the two screens can never
 * disagree about whether a listing "passes".
 *
 * Kept structurally typed against a minimal shape so both
 * `AdminListingSummary` (queue rows) and `AdminListingDetail` (the inspect
 * dossier) satisfy it without a cast.
 */
export interface ListingComplianceInput {
  readonly photoCount: number;
  readonly safetyNotes: string | null;
  readonly ageFromMonths: number | null;
  readonly ageToMonths: number | null;
  readonly hygieneNotes: string | null;
}

export interface ListingComplianceChecklist {
  readonly photos: boolean;
  readonly safety: boolean;
  readonly hygiene: boolean;
}

/** Design's `CheckPill`/compliance-checklist threshold: "Clear photos" needs ≥3 shots. */
const MIN_COMPLIANT_PHOTO_COUNT = 3;

function hasText(value: string | null): boolean {
  return value !== null && value.trim().length > 0;
}

export function computeListingCompliance(
  listing: ListingComplianceInput,
): ListingComplianceChecklist {
  const hasAgeRange = listing.ageFromMonths !== null || listing.ageToMonths !== null;
  return {
    photos: listing.photoCount >= MIN_COMPLIANT_PHOTO_COUNT,
    safety: hasText(listing.safetyNotes) && hasAgeRange,
    hygiene: hasText(listing.hygieneNotes),
  };
}
