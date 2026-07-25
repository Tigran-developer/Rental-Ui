import {
  formatDistanceMeters,
  kmToMeters,
  localeTagForLanguage,
  metersToKm,
  metersToSliderValue,
  RADIUS_MAX_METERS,
  RADIUS_MIN_METERS,
  RADIUS_PRESET_METERS,
  RADIUS_SLIDER_MAX,
  RADIUS_SLIDER_MIN,
  sliderValueToMeters,
  snapRadiusMeters,
} from './radius-scale.util';

describe('snapRadiusMeters', () => {
  it('snaps to 50 m steps below 1 km', () => {
    expect(snapRadiusMeters(437)).toBe(450);
    expect(snapRadiusMeters(210)).toBe(200);
  });

  it('snaps to 100 m steps between 1 km and 3 km', () => {
    expect(snapRadiusMeters(1240)).toBe(1200);
    expect(snapRadiusMeters(2960)).toBe(3000);
  });

  it('snaps to 500 m steps from 3 km up', () => {
    expect(snapRadiusMeters(3200)).toBe(3000);
    expect(snapRadiusMeters(11800)).toBe(12000);
  });
});

describe('sliderValueToMeters / metersToSliderValue (log scale)', () => {
  it('maps the slider extremes to the design-mandated 200 m – 20 km range', () => {
    expect(sliderValueToMeters(RADIUS_SLIDER_MIN)).toBe(RADIUS_MIN_METERS);
    expect(sliderValueToMeters(RADIUS_SLIDER_MAX)).toBe(RADIUS_MAX_METERS);
  });

  it('clamps out-of-range slider input instead of extrapolating', () => {
    expect(sliderValueToMeters(-500)).toBe(RADIUS_MIN_METERS);
    expect(sliderValueToMeters(5000)).toBe(RADIUS_MAX_METERS);
  });

  it('is monotonically increasing across the whole track', () => {
    let previous = -Infinity;
    for (let v = RADIUS_SLIDER_MIN; v <= RADIUS_SLIDER_MAX; v += 25) {
      const meters = sliderValueToMeters(v);
      expect(meters).toBeGreaterThanOrEqual(previous);
      previous = meters;
    }
  });

  it('metersToSliderValue is the approximate inverse of sliderValueToMeters', () => {
    for (const meters of RADIUS_PRESET_METERS) {
      const v = metersToSliderValue(meters);
      const roundTripped = sliderValueToMeters(v);
      // Round-tripping through the log scale + snap can drift by one snap
      // step (e.g. 50 m near the low end) — never further.
      expect(Math.abs(roundTripped - meters)).toBeLessThanOrEqual(100);
    }
  });

  it('clamps metersToSliderValue for out-of-range metres', () => {
    expect(metersToSliderValue(0)).toBe(RADIUS_SLIDER_MIN);
    expect(metersToSliderValue(1_000_000)).toBe(RADIUS_SLIDER_MAX);
  });
});

describe('metersToKm / kmToMeters', () => {
  it('round-trips whole and fractional values', () => {
    expect(metersToKm(3000)).toBe(3);
    expect(metersToKm(2500)).toBe(2.5);
    expect(kmToMeters(3)).toBe(3000);
    expect(kmToMeters(0.2)).toBe(200);
  });

  it('rounds metersToKm to 2 decimals (no long float tails)', () => {
    expect(metersToKm(233)).toBe(0.23);
  });
});

describe('formatDistanceMeters', () => {
  const labelsEn = { meters: 'm', kilometers: 'km' };
  const labelsRu = { meters: 'м', kilometers: 'км' };

  it('renders sub-kilometre values in metres, unrounded unit word from the caller', () => {
    expect(formatDistanceMeters(500, 'en-US', labelsEn)).toBe('500 m');
    expect(formatDistanceMeters(950, 'ru-RU', labelsRu)).toBe('950 м');
  });

  it('renders whole kilometres with no decimal', () => {
    expect(formatDistanceMeters(3000, 'en-US', labelsEn)).toBe('3 km');
    expect(formatDistanceMeters(20000, 'en-US', labelsEn)).toBe('20 km');
  });

  it('renders fractional kilometres with exactly one decimal', () => {
    expect(formatDistanceMeters(2500, 'en-US', labelsEn)).toBe('2.5 km');
  });

  it('uses the locale decimal separator — comma for ru-RU, period for en-US', () => {
    expect(formatDistanceMeters(2500, 'ru-RU', labelsRu)).toBe('2,5 км');
    expect(formatDistanceMeters(2500, 'en-US', labelsEn)).toBe('2.5 km');
  });
});

describe('localeTagForLanguage', () => {
  it('maps every supported UI language to a BCP 47 tag', () => {
    expect(localeTagForLanguage('en')).toBe('en-US');
    expect(localeTagForLanguage('ru')).toBe('ru-RU');
    expect(localeTagForLanguage('hy')).toBe('hy-AM');
  });
});
