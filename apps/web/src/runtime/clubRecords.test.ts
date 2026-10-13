import { describe, expect, it } from 'vitest';
import type { MatchRecord } from '../../../../packages/contracts/src/types';
import { clubRecords } from './clubRecords';

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
) => ({
  id: `m${++serial}`,
  year,
  round: serial,
  kind,
  home,
  away,
  score: { home: score[0], away: score[1] },
});

describe('club match records', () => {
  it('finds the widest margins and the most goals from our side, the earlier match keeping a tie', () => {
    const matches = [
      match(1950, 'lower', US, RIVAL, [4, 0]),
      match(1950, 'lower', RIVAL, US, [0, 4]),
      match(1950, 'lower', OTHER, US, [5, 1]),
      match(1951, 'cup', US, OTHER, [5, 3]),
      match(1951, 'league', RIVAL, OTHER, [9, 0]),
    ];
    const records = clubRecords(matches, US);
    expect(records.played).toBe(4);
    expect(records.biggestWin).toMatchObject({ id: matches[0].id, own: 4, other: 0, home: true });
    expect(records.biggestLoss).toMatchObject({ id: matches[2].id, own: 1, other: 5 });
    expect(records.biggestLoss?.opponent).toBe(OTHER);
    expect(records.mostScored).toMatchObject({ id: matches[3].id, own: 5 });
  });

  it('follows runs across seasons and marks the one still going', () => {
    const matches = [
      match(1950, 'lower', US, RIVAL, [1, 0]),
      match(1950, 'lower', US, RIVAL, [2, 0]),
      match(1950, 'lower', US, RIVAL, [1, 1]),
      match(1950, 'lower', US, RIVAL, [0, 2]),
      match(1951, 'league', US, RIVAL, [3, 0]),
      match(1951, 'league', US, RIVAL, [2, 0]),
      match(1951, 'league', US, RIVAL, [1, 0]),
    ];
    const records = clubRecords(matches, US);
    expect(records.winning).toMatchObject({ length: 3, live: true });
    expect(records.winning.from?.id).toBe(matches[4].id);
    expect(records.unbeaten).toMatchObject({ length: 3, live: false });
    expect(records.unbeaten.from?.id).toBe(matches[0].id);
    expect(records.cleanSheets).toMatchObject({ length: 3, live: true });
    expect(records.losing).toMatchObject({ length: 1, live: false });
    expect(records.winless).toMatchObject({ length: 2, live: false });
    expect(records.winless.to?.id).toBe(matches[3].id);
  });

  it('counts a shoot-out decider as the draw it was after 90 minutes', () => {
    const records = clubRecords([match(1952, 'cup', US, RIVAL, [1, 1])], US);
    expect(records.winning.length).toBe(0);
    expect(records.unbeaten).toMatchObject({ length: 1, live: true });
    expect(records.biggestWin).toBeUndefined();
  });
});
