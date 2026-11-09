import { afterEach, describe, expect, it } from 'vitest';
import { emptyPlayerDetail, PD } from '../../../../../../packages/contracts/src/detail';
import { createLocaleFormatters } from '../../../presentation/locale';
import { setLocaleFormatters } from '../../../presentation/format';
import {
  fullStatsAppearances,
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
