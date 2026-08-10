/**
 * Honest uncertainty radius (metres) drawn around a fuzzed listing pin.
 *
 * The backend snaps non-owner coordinates to the centroid of a geohash-**7**
 * cell — measured at ~117m (E-W) x 153m (N-S) at Yerevan's latitude (bumped
 * from precision 6 to 7 on 2026-07-25; the old geohash-6 cell was ~933m x
 * 611m — see `GeohashSnapper.Precision` in rental-api and the
 * `2026-07-25-geohash-precision-and-radius-circle` feature note). The
 * worst-case distance from that centroid to any point still inside the cell
 * is half the cell's diagonal — the true minimum a circle can be without
 * lying about precision:
 *
 *   sqrt((117/2)^2 + (153/2)^2) ≈ 96.3m
 *
 * 100m is a deliberately tight round number just above that 96.3m minimum
 * (it was 150m until 2026-08-03, when the circle was judged to read as
 * wider than the precision we actually withhold). The margin is now small
 * — ~3.7m — so this constant can no longer absorb a precision change
 * silently: if `GeohashSnapper.Precision` in rental-api ever moves again,
 * recompute the half-diagonal above FIRST and raise this value to match.
 * Never draw a radius smaller than the real uncertainty, or the map implies
 * more precision than we actually have — the exact failure this feature
 * exists to prevent. The pill next to the map interpolates this number
 * ("~100 m"), so it follows the constant automatically.
 */
export const APPROXIMATE_AREA_RADIUS_METERS = 100;
