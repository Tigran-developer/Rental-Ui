import type { ListingMapPin } from './listing-map-pin.model';

/**
 * A cluster of `ListingMapPin`s that publish the exact same coordinate pair.
 *
 * Why exact-coordinate equality is a sound cluster key: the backend snaps
 * every published listing coordinate to a geohash-7 cell centroid before
 * storing it (`decimal(9,6)`), so two listings whose real addresses fall in
 * the same ~117 m × 153 m cell publish byte-identical `latitude`/`longitude`
 * values. Grouping on the formatted pair is therefore exact, not a proximity
 * heuristic — no distance math, no clustering radius to tune.
 *
 * Known limitation: two neighbouring addresses that straddle a cell boundary
 * publish centroids 117–153 m apart and will NOT merge — they stay two
 * separate circles on the map. Pixel-distance clustering (merging visually
 * close-but-not-identical pins) is deliberately out of scope for this
 * feature.
 */
export interface ListingPinGroup {
  /** `${lat.toFixed(6)},${lng.toFixed(6)}` — stable across renders. */
  key: string;
  latitude: number;
  longitude: number;
  pins: ListingMapPin[];
}

/**
 * Groups pins by exact coordinate. Preserves input order both between groups
 * (a group is emitted the first time its coordinate is seen) and within a
 * group's `pins` array — the backend orders `items` by `CreatedAt`
 * descending, and callers rely on that order surviving grouping.
 */
export function groupPinsByCoordinate(pins: ListingMapPin[]): ListingPinGroup[] {
  const groupsByKey = new Map<string, ListingPinGroup>();

  for (const pin of pins) {
    const key = `${pin.latitude.toFixed(6)},${pin.longitude.toFixed(6)}`;
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.pins.push(pin);
      continue;
    }
    groupsByKey.set(key, {
      key,
      latitude: pin.latitude,
      longitude: pin.longitude,
      pins: [pin],
    });
  }

  return Array.from(groupsByKey.values());
}
