import {
  CATEGORY_COLOR_OPTIONS,
  DEFAULT_CATEGORY_COLOR,
  toSafeCategoryColor,
} from './category-palette.model';

describe('toSafeCategoryColor', () => {
  it('passes through a valid 6-digit hex colour', () => {
    expect(toSafeCategoryColor('#D9E8FF')).toBe('#D9E8FF');
  });

  it('passes through a valid 8-digit hex colour (with alpha)', () => {
    expect(toSafeCategoryColor('#D9E8FFCC')).toBe('#D9E8FFCC');
  });

  it('accepts lowercase hex digits', () => {
    expect(toSafeCategoryColor('#d9e8ff')).toBe('#d9e8ff');
  });

  it('falls back to the default for null', () => {
    expect(toSafeCategoryColor(null)).toBe(DEFAULT_CATEGORY_COLOR);
  });

  it('falls back to the default for undefined', () => {
    expect(toSafeCategoryColor(undefined)).toBe(DEFAULT_CATEGORY_COLOR);
  });

  it('falls back to the default for an empty string', () => {
    expect(toSafeCategoryColor('')).toBe(DEFAULT_CATEGORY_COLOR);
  });

  it('falls back to the default for a non-hex value', () => {
    expect(toSafeCategoryColor('not-a-color')).toBe(DEFAULT_CATEGORY_COLOR);
  });

  it('falls back to the default for a CSS keyword (rejects anything but hex)', () => {
    expect(toSafeCategoryColor('red')).toBe(DEFAULT_CATEGORY_COLOR);
  });

  it('falls back to the default for a hex value of the wrong length', () => {
    expect(toSafeCategoryColor('#D9E8F')).toBe(DEFAULT_CATEGORY_COLOR);
  });

  it('falls back to the default for an unbounded value (injection guard)', () => {
    expect(toSafeCategoryColor('#D9E8FF; background: url(javascript:alert(1))')).toBe(
      DEFAULT_CATEGORY_COLOR,
    );
  });

  it('the default colour is itself one of the picker palette options', () => {
    expect(CATEGORY_COLOR_OPTIONS).toContain(DEFAULT_CATEGORY_COLOR);
  });
});
