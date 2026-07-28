import { DRAM_SYMBOL, DramCurrencyPipe } from './dram-currency.pipe';

describe('DramCurrencyPipe', () => {
  const pipe = new DramCurrencyPipe();

  it('exposes the dram symbol as a shared constant, not a bare literal', () => {
    // Guards against a stray hardcoded currency symbol (e.g. ₽) creeping back
    // in anywhere that needs to render the symbol on its own — those sites
    // should import DRAM_SYMBOL instead of hardcoding the glyph.
    expect(DRAM_SYMBOL).toBe('֏');
  });

  it('formats a whole number with grouping and a trailing dram symbol', () => {
    expect(pipe.transform(2500)).toBe(`2,500 ${DRAM_SYMBOL}`);
    expect(pipe.transform(12500)).toBe(`12,500 ${DRAM_SYMBOL}`);
  });

  it('rounds fractional amounts — dram has no minor unit', () => {
    expect(pipe.transform(2500.5)).toBe('2,501 ֏');
    expect(pipe.transform(2500.4)).toBe('2,500 ֏');
  });

  it('accepts numeric strings', () => {
    expect(pipe.transform('3000')).toBe('3,000 ֏');
  });

  it('returns null for null, undefined, empty string, or non-numeric input', () => {
    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform(undefined)).toBeNull();
    expect(pipe.transform('')).toBeNull();
    expect(pipe.transform('not-a-number')).toBeNull();
  });

  it('formats zero', () => {
    expect(pipe.transform(0)).toBe('0 ֏');
  });
});
