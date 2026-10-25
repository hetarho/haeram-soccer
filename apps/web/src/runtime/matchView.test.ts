import { describe, expect, it } from 'vitest';
import type { MatchPlayback } from '../../../../packages/contracts/src/types';
import { unfinishedPlayback } from './matchView';

describe('unfinished live observation', () => {
  const playback = { record: { id: 'observed' } } as MatchPlayback;

  it('keeps the existing playback available until its presentation finishes', () => {
    expect(unfinishedPlayback(playback, { matchId: 'observed', finished: false })).toBe(playback);
    expect(unfinishedPlayback(playback, { matchId: 'observed', finished: true })).toBeUndefined();
  });

  it('ignores absent playback and presentation state from a previous match', () => {
    expect(unfinishedPlayback(undefined, { matchId: 'observed', finished: false })).toBeUndefined();
    expect(unfinishedPlayback(playback, { matchId: 'previous', finished: false })).toBeUndefined();
    expect(unfinishedPlayback(playback, { finished: false })).toBeUndefined();
  });
});
