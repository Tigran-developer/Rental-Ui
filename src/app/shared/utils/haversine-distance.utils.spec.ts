import { EARTH_RADIUS_KM, haversineDistanceKm } from './haversine-distance.utils';

describe('haversineDistanceKm', () => {
  it('returns 0 for the same point', () => {
    expect(haversineDistanceKm({ lat: 40.1776, lng: 44.5126 }, { lat: 40.1776, lng: 44.5126 })).toBe(0);
  });

  it('matches the analytic one-degree-of-latitude distance at the equator (~111.2 km)', () => {
    // With dLng = 0 the formula reduces to 2*R*asin(sin(dLat/2)) = the
    // meridian arc length for 1° — a value independent of any backend/API
    // fixture, so this pins the constant + formula against pure geometry.
    const oneDegreeKm = (2 * Math.PI * EARTH_RADIUS_KM) / 360;
    const measured = haversineDistanceKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(measured).toBeCloseTo(oneDegreeKm, 3);
    expect(measured).toBeCloseTo(111.195, 2);
  });

  it('is symmetric — order of the two points does not change the result', () => {
    const a = { lat: 40.1776, lng: 44.5126 };
    const b = { lat: 40.1631, lng: 44.4839 };
    expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a), 10);
  });

  it('computes a realistic short Yerevan distance (~2-3 km) for two known nearby points', () => {
    // Republic Square vs. a point roughly south-west, ~2.8 km away (independently
    // cross-checked against a mapping tool, not derived from this function).
    const republicSquare = { lat: 40.1776, lng: 44.5126 };
    const nearby = { lat: 40.1631, lng: 44.4839 };
    const km = haversineDistanceKm(republicSquare, nearby);
    expect(km).toBeGreaterThan(2);
    expect(km).toBeLessThan(3.5);
  });

  it('longitude degrees shrink with cos(latitude) — same lng delta is shorter far from the equator', () => {
    const atEquator = haversineDistanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    const atYerevanLatitude = haversineDistanceKm(
      { lat: 40.1776, lng: 44.5126 },
      { lat: 40.1776, lng: 45.5126 },
    );
    expect(atYerevanLatitude).toBeLessThan(atEquator);
  });
});
