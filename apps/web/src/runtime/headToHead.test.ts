import { describe, expect, it } from 'vitest';
import type { Highlight, MatchRecord } from '../../../../packages/contracts/src/types';
import { headToHead } from './headToHead';

const US = 'ENG:club',
  RIVAL = 'ENG:3:0:4',
  OTHER = 'ENG:3:0:9';
let serial = 0;
const match = (
  year: number,
  kind: MatchRecord['kind'],
  home: string,
  away: string,
  score: [number, number],
  highlights: Highlight[] = [],
) => ({
  id: `m${++serial}`,
  year,
  round: serial,
  kind,
  home,
  away,
  score: { home: score[0], away: score[1] },
  highlights,
});
const shootout = (side: 0 | 1): Highlight => ({
  minute: 120,
  side,
  player: '승부차기',
  action: `승부차기 ${side ? '원정' : '홈'} 승리`,
});

describe('all-time head-to-head', () => {
  it('counts every competition from our side and leaves other fixtures out', () => {
    const matches = [
      match(1950, 'lower', US, RIVAL, [2, 0]),
      match(1950, 'lower', RIVAL, US, [3, 1]),
      match(1950, 'lower', US, OTHER, [5, 0]),
      match(1951, 'league', RIVAL, US, [0, 4]),
      match(1951, 'cup', US, RIVAL, [1, 1], [shootout(0)]),
      match(1952, 'europe', RIVAL, US, [2, 2]),
      match(1952, 'playoff', US, RIVAL, [0, 1]),
    ];
    const record = headToHead(matches, US, RIVAL);
    expect(record).toMatchObject({
      played: 6,
      won: 2,
      drawn: 2,
      lost: 2,
      gf: 10,
      ga: 7,
      league: 3,
      cup: 1,
      europe: 1,
      playoff: 1,
      first: 1950,
    });
    // An away win is still ours: home is our venue, own our goals.
    expect(record.biggestWin).toMatchObject({ year: 1951, kind: 'league', home: false, own: 4 });
    expect(record.biggestLoss).toMatchObject({ year: 1950, home: false, own: 1, other: 3 });
    expect(record.recent.map((m) => m.id)).toEqual(
      matches.filter((m) => m.home === RIVAL || m.away === RIVAL).map((m) => m.id),
    );
  });

  it('counts a shoot-out as a draw and notes who won it', () => {
    const won = headToHead([match(1960, 'cup', RIVAL, US, [1, 1], [shootout(1)])], US, RIVAL);
    expect(won).toMatchObject({ played: 1, drawn: 1, won: 0, lost: 0 });
    expect(won.recent[0].shootout).toBe('won');
    expect(won.biggestWin).toBeUndefined();
    const lost = headToHead([match(1960, 'cup', US, RIVAL, [0, 0], [shootout(1)])], US, RIVAL);
    expect(lost.recent[0].shootout).toBe('lost');
    // A two-legged tie settles on the second leg, whose own score still decides that game.
    const leg = headToHead([match(1961, 'europe', US, RIVAL, [0, 1], [shootout(0)])], US, RIVAL);
    expect(leg).toMatchObject({ lost: 1, drawn: 0 });
    expect(leg.recent[0].shootout).toBe('won');
  });

  it('keeps the widest margin, then the most goals, then the earlier meeting', () => {
    const record = headToHead(
      [
        match(1970, 'league', US, RIVAL, [3, 0]),
        match(1971, 'league', US, RIVAL, [4, 1]),
        match(1972, 'league', RIVAL, US, [1, 4]),
        match(1973, 'league', US, RIVAL, [2, 0]),
        match(1974, 'league', US, RIVAL, [0, 2]),
        match(1975, 'league', US, RIVAL, [1, 3]),
      ],
      US,
      RIVAL,
    );
    expect(record.biggestWin?.year).toBe(1971);
    expect(record.biggestLoss?.year).toBe(1975);
  });

  it('lists only the last ten meetings and reports none before the first', () => {
    const matches = Array.from({ length: 14 }, (_, i) =>
      match(1980 + i, 'league', i % 2 ? US : RIVAL, i % 2 ? RIVAL : US, [1, 0]),
    );
    const record = headToHead(matches, US, RIVAL);
    expect(record.played).toBe(14);
    expect(record.first).toBe(1980);
    expect(record.recent).toHaveLength(10);
    expect(record.recent[0].year).toBe(1984);
    expect(record.recent.at(-1)?.year).toBe(1993);
    const none = headToHead(matches, US, OTHER);
    expect(none).toMatchObject({ played: 0, recent: [] });
    expect(none).not.toHaveProperty('first');
  });
});
