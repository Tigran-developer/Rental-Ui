import {
  clampRadiusKm,
  parseRadiusKmParam,
  RADIUS_MAX_KM,
  RADIUS_MIN_KM,
  serializeRadiusKmParam,
} from './listings-filter.model';

describe('clampRadiusKm', () => {
  it('clamps below the backend minimum (0.2 km) up to it', () => {
    expect(clampRadiusKm(0.05)).toBe(RADIUS_MIN_KM);
    expect(clampRadiusKm(0)).toBe(RADIUS_MIN_KM);
  });

  it('clamps above the backend maximum (20 km) down to it', () => {
    expect(clampRadiusKm(35)).toBe(RADIUS_MAX_KM);
  });

  it('leaves an in-range value untouched', () => {
    expect(clampRadiusKm(3)).toBe(3);
  });
});

describe('parseRadiusKmParam', () => {
  it('returns null for a missing param', () => {
    expect(parseRadiusKmParam(null)).toBeNull();
  });

  it('returns null for blank/whitespace-only values', () => {
    expect(parseRadiusKmParam('')).toBeNull();
    expect(parseRadiusKmParam('   ')).toBeNull();
  });

  it('returns null for garbage a user could hand-edit into the URL, never NaN or a crash', () => {
    expect(parseRadiusKmParam('abc')).toBeNull();
    expect(parseRadiusKmParam('3km')).toBeNull();
  });

  it('parses a well-formed fractional value', () => {
    expect(parseRadiusKmParam('2.5')).toBe(2.5);
  });

  it('clamps an out-of-range URL value to the backend range instead of sending it verbatim', () => {
    expect(parseRadiusKmParam('0.05')).toBe(RADIUS_MIN_KM);
    expect(parseRadiusKmParam('999')).toBe(RADIUS_MAX_KM);
  });
});

describe('serializeRadiusKmParam', () => {
  it('omits the param entirely for null (rather than writing "null"/"")', () => {
    expect(serializeRadiusKmParam(null)).toBeNull();
  });

  it('rounds to 2 decimals so the URL never grows a long float tail', () => {
    expect(serializeRadiusKmParam(2.333333)).toBe('2.33');
  });

  it('clamps before serializing', () => {
    expect(serializeRadiusKmParam(50)).toBe(String(RADIUS_MAX_KM));
  });

  it('round-trips cleanly through parseRadiusKmParam', () => {
    const serialized = serializeRadiusKmParam(3);
    expect(parseRadiusKmParam(serialized)).toBe(3);
  });
});
