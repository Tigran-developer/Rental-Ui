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
 * 150m is used instead of that bare 96.3m minimum for two independent
 * reasons that happen to agree: it is the exact figure the approved design's
 * pill shows on every screen state ("~150 m"), and it keeps a comfortable
 * margin over the measured worst case — wider, proportionally, than the
 * previous geohash-6-era value's own margin (600m against a ~557.6m
 * half-diagonal). Never draw a radius smaller than the real uncertainty, or
 * the map implies more precision than we actually have — the exact failure
 * this feature exists to prevent.
 */
export const APPROXIMATE_AREA_RADIUS_METERS = 150;
