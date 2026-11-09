import { afterEach, describe, expect, it } from 'vitest';
import type { FullStatsRead } from '../../../../../../packages/contracts/src/match-model';
import type { World } from '../../../../../../packages/contracts/src/types';
import { emptyPlayerDetail, PD } from '../../../../../../packages/contracts/src/detail';
import { createLocaleFormatters } from '../../../presentation/locale';
import { setLocaleFormatters } from '../../../presentation/format';
import {
  fullStatsAppearances,
  fullStatsPlayers,
  fullStatsRates,
  leaders,
  perMatch,
  type FullStatsPlayer,
} from './fullStatsView';

afterEach(() => setLocaleFormatters());

/** Synthetic player totals; these tests read no generated world or settled fixture. */
function player(): FullStatsPlayer {
  const metrics = Array<number>(12).fill(0),
    detail = emptyPlayerDetail();
  metrics[0] = 2;
  metrics[10] = 200;
  detail[PD.xg] = 145;
  detail[PD.xa] = 80;
  detail[PD.keyPasses] = 2;
  return {
    id: 'player',
    name: 'Synthetic Player',
    position: 'CM',
    clubs: ['club'],
    ours: true,
    appearances: 12,
    starts: 10,
    minutes: 200,
    metrics,
    detail,
  };
}

describe('localized league-statistic read models', () => {
  it('preserves default decimals, recorded zero rates and unavailable denominators', () => {
    setLocaleFormatters(createLocaleFormatters('ko-KR'));
    expect(perMatch(3, 2)).toBe('1.50');
    expect(perMatch(3, 0)).toBe('—');
    expect(fullStatsRates(player())[0]?.text).toBe('0.90');
    expect(fullStatsRates(player())[1]?.text).toBe('0.00');
    expect(
      fullStatsRates({ ...player(), metrics: Array<number>(12).fill(0), minutes: 0 })[0]?.text,
    ).toBe('—');
    expect(leaders([player()], 'xg')[0]).toMatchObject({ total: '1.45', rate: '0.65' });
    expect(fullStatsAppearances(player())).toBe('12경기 · 교체 2');
  });

  it('formats German rates and totals without changing input or numeric ordering', () => {
    const first = player(),
      second = { ...player(), id: 'second', minutes: 100 },
      snapshot = structuredClone(first);
    setLocaleFormatters(createLocaleFormatters('de-DE'));
    expect(perMatch(3, 2)).toBe('1,50');
    expect(fullStatsRates(first)[0]?.text).toBe('0,90');
    const ranked = leaders([first, second], 'xg');
    expect(ranked.map((row) => row.player.id)).toEqual(['second', 'player']);
    expect(ranked[0]).toMatchObject({ total: '1,45', rate: '1,30' });
    expect(first).toEqual(snapshot);
  });

  it('formats Arabic leader counts, minute samples and appearances', () => {
    setLocaleFormatters(createLocaleFormatters('ar-SA'));
    expect(leaders([player()], 'goals')[0]).toMatchObject({
      total: '٢',
      rate: '٠٫٩٠',
      sample: '٢٠٠분',
    });
    expect(fullStatsAppearances(player())).toBe('١٢경기 · 교체 ٢');
    expect(perMatch(3, 2, 1)).toBe('١٫٥');
  });
});

it('preserves first-seen contribution sets and retained own identity without inventing chronology', () => {
  const part = (club: string, goals: number) => {
    const metrics = Array<number>(12).fill(0);
    metrics[0] = goals;
    metrics[10] = goals * 90;
    return { club, appearances: goals, starts: goals, metrics, detail: emptyPlayerDetail() };
  };
  // A-B-A is stored as A's combined contributions and B, in first-seen unique order.
  const read: FullStatsRead = {
    year: 2024,
    trackedFrom: { year: 2024, day: 0, round: 0 },
    untracked: 0,
    competition: {
      kind: 'league',
      groupKey: 'ENG:0:0',
      clubs: [],
      players: [
        { id: 'returning', name: 'Returning', position: 'ST', clubs: [part('A', 4), part('B', 2)] },
        { id: 'departed', name: 'Departed', position: 'ST', clubs: [part('A', 1), part('B', 2)] },
      ],
    },
  };
  const before = structuredClone(read);
  const rows = fullStatsPlayers(read, {
    players: [
      { id: 'returning', status: 'active' },
      { id: 'departed', status: 'sold' },
    ],
  } as Pick<World, 'players'>);
  expect(rows.map((row) => [row.id, row.clubs, row.ours, row.metrics[0], row.appearances])).toEqual(
    [
      ['returning', ['A', 'B'], true, 6, 6],
      ['departed', ['A', 'B'], true, 3, 3],
    ],
  );
  expect(read).toEqual(before);
});
