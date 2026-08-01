import { makeListingMapPin } from '../../../../testing/fixtures';
import { groupPinsByCoordinate } from './listing-pin-group.util';

describe('groupPinsByCoordinate', () => {
  it('returns an empty array for empty input', () => {
    expect(groupPinsByCoordinate([])).toEqual([]);
  });

  it('groups a single pin into a single group', () => {
    const pin = makeListingMapPin({ id: 'p1', latitude: 40.1, longitude: 44.5 });

    const groups = groupPinsByCoordinate([pin]);

    expect(groups).toEqual([
      { key: '40.100000,44.500000', latitude: 40.1, longitude: 44.5, pins: [pin] },
    ]);
  });

  it('groups several pins that share the exact same coordinate', () => {
    const pinA = makeListingMapPin({ id: 'a', latitude: 40.1, longitude: 44.5 });
    const pinB = makeListingMapPin({ id: 'b', latitude: 40.1, longitude: 44.5 });
    const pinC = makeListingMapPin({ id: 'c', latitude: 40.1, longitude: 44.5 });

    const groups = groupPinsByCoordinate([pinA, pinB, pinC]);

    expect(groups).toHaveLength(1);
    expect(groups[0].pins).toEqual([pinA, pinB, pinC]);
  });

  it('keeps pins on distinct coordinates in separate groups', () => {
    const pinA = makeListingMapPin({ id: 'a', latitude: 40.1, longitude: 44.5 });
    const pinB = makeListingMapPin({ id: 'b', latitude: 40.2, longitude: 44.6 });

    const groups = groupPinsByCoordinate([pinA, pinB]);

    expect(groups).toHaveLength(2);
    expect(groups[0].pins).toEqual([pinA]);
    expect(groups[1].pins).toEqual([pinB]);
  });

  it('does not merge coordinates that differ only past the 6th decimal precision boundary', () => {
    // Two centroids that straddle a geohash-7 cell boundary — the documented
    // limitation: they must stay two separate groups, never merged.
    const pinA = makeListingMapPin({ id: 'a', latitude: 40.100001, longitude: 44.5 });
    const pinB = makeListingMapPin({ id: 'b', latitude: 40.100002, longitude: 44.5 });

    const groups = groupPinsByCoordinate([pinA, pinB]);

    expect(groups).toHaveLength(2);
  });

  it('preserves input order between groups and within a group', () => {
    const pinA = makeListingMapPin({ id: 'a', latitude: 40.1, longitude: 44.5 });
    const pinB = makeListingMapPin({ id: 'b', latitude: 40.2, longitude: 44.6 });
    const pinC = makeListingMapPin({ id: 'c', latitude: 40.1, longitude: 44.5 });
    const pinD = makeListingMapPin({ id: 'd', latitude: 40.3, longitude: 44.7 });

    const groups = groupPinsByCoordinate([pinA, pinB, pinC, pinD]);

    // First-seen order: (40.1,44.5) group first, then (40.2,44.6), then (40.3,44.7).
    expect(groups.map((g) => g.key)).toEqual([
      '40.100000,44.500000',
      '40.200000,44.600000',
      '40.300000,44.700000',
    ]);
    expect(groups[0].pins.map((p) => p.id)).toEqual(['a', 'c']);
    expect(groups[1].pins.map((p) => p.id)).toEqual(['b']);
    expect(groups[2].pins.map((p) => p.id)).toEqual(['d']);
  });
});
