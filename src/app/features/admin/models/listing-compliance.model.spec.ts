import { computeListingCompliance, type ListingComplianceInput } from './listing-compliance.model';

function input(overrides: Partial<ListingComplianceInput> = {}): ListingComplianceInput {
  return {
    photoCount: 4,
    safetyNotes: 'Small parts — supervise under 3.',
    ageFromMonths: 36,
    ageToMonths: 84,
    hygieneNotes: 'Wiped with child-safe spray between rentals.',
    ...overrides,
  };
}

describe('computeListingCompliance', () => {
  it('passes all three checks when every field is present and photoCount clears the threshold', () => {
    expect(computeListingCompliance(input())).toEqual({
      photos: true,
      safety: true,
      hygiene: true,
    });
  });

  describe('photos', () => {
    it('fails below 3 photos', () => {
      expect(computeListingCompliance(input({ photoCount: 2 })).photos).toBe(false);
    });

    it('passes at exactly 3 photos', () => {
      expect(computeListingCompliance(input({ photoCount: 3 })).photos).toBe(true);
    });
  });

  describe('safety', () => {
    it('fails when safetyNotes is null', () => {
      expect(computeListingCompliance(input({ safetyNotes: null })).safety).toBe(false);
    });

    it('fails when safetyNotes is blank/whitespace-only', () => {
      expect(computeListingCompliance(input({ safetyNotes: '   ' })).safety).toBe(false);
    });

    it('fails when notes are present but no age bound is set', () => {
      expect(
        computeListingCompliance(input({ ageFromMonths: null, ageToMonths: null })).safety,
      ).toBe(false);
    });

    it('passes with only ageFromMonths set', () => {
      expect(computeListingCompliance(input({ ageFromMonths: 12, ageToMonths: null })).safety).toBe(
        true,
      );
    });

    it('passes with only ageToMonths set', () => {
      expect(computeListingCompliance(input({ ageFromMonths: null, ageToMonths: 48 })).safety).toBe(
        true,
      );
    });
  });

  describe('hygiene', () => {
    it('fails when hygieneNotes is null', () => {
      expect(computeListingCompliance(input({ hygieneNotes: null })).hygiene).toBe(false);
    });

    it('fails when hygieneNotes is blank/whitespace-only', () => {
      expect(computeListingCompliance(input({ hygieneNotes: '  \n ' })).hygiene).toBe(false);
    });

    it('passes with non-empty hygieneNotes', () => {
      expect(computeListingCompliance(input({ hygieneNotes: 'Machine washed 60°C' })).hygiene).toBe(
        true,
      );
    });
  });

  it('fails everything for a bare-minimum submission', () => {
    expect(
      computeListingCompliance({
        photoCount: 0,
        safetyNotes: null,
        ageFromMonths: null,
        ageToMonths: null,
        hygieneNotes: null,
      }),
    ).toEqual({ photos: false, safety: false, hygiene: false });
  });
});
