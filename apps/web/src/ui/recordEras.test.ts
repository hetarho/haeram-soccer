import { describe, expect, it } from 'vitest';
import type { OwnerSeasonRecord } from '../../../../packages/contracts/src/owner';
import {
  businessSign,
  finishText,
  honoursText,
  newestFirst,
  ownerSeasonRows,
  runsText,
} from './recordEras';

const record = (year: number, business: string): OwnerSeasonRecord => ({
  year,
  currency: 'GBP',
  fortune: '100000',
  business,
  living: '1000',
  injected: '0',
  dividend: '0',
  fanMood: 60,
});

describe('the records room’s eras (→HIST-21, OWNER-17)', () => {
  it('writes a season’s cup runs on one line, the domestic cup as 컵', () => {
    expect(
      runsText([
        { key: 'cup', name: '잉글랜드 컵', reached: '결승', champion: true },
        { key: 'ucl', name: 'European Cup', reached: '8강' },
      ]),
    ).toBe('컵 우승 · European Cup 8강');
    expect(runsText([])).toBe('—');
    expect(runsText(undefined)).toBe('—');
  });

  it('writes a finish before the owner by division and place, or a dash without a row', () => {
    expect(
      finishText('ENG', { year: 1950, finish: { tier: 1, group: 0, place: 3 }, runs: [] }),
    ).toBe('2부 3위');
    expect(
      finishText('ITA', { year: 1950, finish: { tier: 2, group: 1, place: 1 }, runs: [] }),
    ).toBe('3부 B조 1위');
    expect(finishText('ENG', { year: 1950, runs: [] })).toBe('—');
  });

  it('names the honours won before the owner', () => {
    expect(honoursText({ league: 2, cup: 0, europe: 1 })).toBe(
      '리그 우승 2회 · 컵 우승 0회 · 유럽 1회',
    );
  });

  it('lists seasons newest first without reordering the source', () => {
    const seasons = [{ year: 1950 }, { year: 1952 }, { year: 1951 }];
    expect(newestFirst(seasons).map((season) => season.year)).toEqual([1952, 1951, 1950]);
    expect(seasons.map((season) => season.year)).toEqual([1950, 1952, 1951]);
  });

  it('reads the owner’s season records newest first, none in a founded career', () => {
    const owner = { seasonRecords: [record(1960, '0'), record(1961, '500')] };
    expect(ownerSeasonRows(owner).map((row) => row.year)).toEqual([1961, 1960]);
    expect(ownerSeasonRows(undefined)).toEqual([]);
  });

  it('signs only a business gain; a loss carries its own minus', () => {
    expect(businessSign(record(1960, '500'))).toBe('+');
    expect(businessSign(record(1960, '-500'))).toBe('');
    expect(businessSign(record(1960, '0'))).toBe('');
  });
});
