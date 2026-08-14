import {
  activityActorDisplay,
  activityLineKey,
  activityTone,
  parseRecategoriseDetail,
  parseRejectDetail,
} from './admin-activity-line.util';

describe('activityLineKey / activityTone', () => {
  it('maps a known action to its line key and tone', () => {
    expect(activityLineKey('ListingApproved')).toBe(
      'admin.overview.activity.lines.ListingApproved',
    );
    expect(activityTone('ListingApproved')).toBe('success');

    expect(activityLineKey('ListingRejected')).toBe(
      'admin.overview.activity.lines.ListingRejected',
    );
    expect(activityTone('ListingRejected')).toBe('danger');

    expect(activityLineKey('ListingRecategorised')).toBe(
      'admin.overview.activity.lines.ListingRecategorised',
    );
    expect(activityTone('ListingRecategorised')).toBe('info');
  });

  it('falls back to a generic line key and neutral tone for an unrecognised (future) action', () => {
    expect(activityLineKey('SomeFutureAction')).toBe('admin.overview.activity.lines.generic');
    expect(activityTone('SomeFutureAction')).toBe('neutral');
  });
});

describe('activityActorDisplay', () => {
  it('joins first + last name and trims', () => {
    const result = activityActorDisplay('Sona', 'K.');
    expect(result).toEqual({ name: 'Sona K.', isFallback: false });
  });

  it('falls back to a translation key when both names are null (deleted actor)', () => {
    const result = activityActorDisplay(null, null);
    expect(result).toEqual({ name: 'admin.overview.activity.removedActor', isFallback: true });
  });

  it('falls back when both names are present but blank', () => {
    const result = activityActorDisplay('', '');
    expect(result.isFallback).toBe(true);
  });
});

describe('parseRecategoriseDetail', () => {
  it('parses the fromCategory/toCategory shape', () => {
    expect(
      parseRecategoriseDetail('{"fromCategory":"Wooden Toys","toCategory":"Pretend Play"}'),
    ).toEqual({ fromCategory: 'Wooden Toys', toCategory: 'Pretend Play' });
  });

  it('returns null for null/absent detailJson', () => {
    expect(parseRecategoriseDetail(null)).toBeNull();
    expect(parseRecategoriseDetail('')).toBeNull();
  });

  it('degrades to null on malformed JSON rather than throwing', () => {
    expect(parseRecategoriseDetail('{not json')).toBeNull();
  });

  it('returns null when the shape does not match (missing/wrong-typed fields)', () => {
    expect(parseRecategoriseDetail('{"fromCategory":"X"}')).toBeNull();
    expect(parseRecategoriseDetail('{"fromCategory":1,"toCategory":"Y"}')).toBeNull();
    expect(parseRecategoriseDetail('null')).toBeNull();
    expect(parseRecategoriseDetail('"just a string"')).toBeNull();
  });
});

describe('parseRejectDetail', () => {
  it('parses the reasonCode field', () => {
    expect(parseRejectDetail('{"reasonCode":"poorImages","note":"blurry"}')).toEqual({
      reasonCode: 'poorImages',
    });
  });

  it('returns null for null/absent detailJson', () => {
    expect(parseRejectDetail(null)).toBeNull();
  });

  it('degrades to null on malformed JSON rather than throwing', () => {
    expect(parseRejectDetail('{bad')).toBeNull();
  });

  it('returns null when reasonCode is missing or wrong-typed', () => {
    expect(parseRejectDetail('{"note":"blurry"}')).toBeNull();
    expect(parseRejectDetail('{"reasonCode":7}')).toBeNull();
  });
});
