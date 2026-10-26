import { describe, expect, it } from 'vitest';
import { COUNTRIES, currency, priceIndex } from '../../catalogs/src/index';
import type { CountryCode, Fixture, KnockoutRound } from '../../contracts/src/types';
import { AMATEUR_CLUBS, createWorld, finishCups, finishEurope, prepareSeason } from './index';
import { knockoutStage, type CupStage } from './stages';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';

/** Seasons that span every domestic cup size and each continental format and calendar change. */
const YEARS = [1950, 1955, 1960, 1971, 1991, 1993, 1994, 1997, 1999, 2004, 2009, 2021, 2024];

/** The stage a live fixture shows: its round's label and, in a two-legged round, the leg. */
function liveStage(competition: string, rounds: KnockoutRound[], f: Fixture): CupStage {
  const [, index, second] = /:k(\d+):\d+(:2)?$/.exec(f.id)!;
  const round = rounds[Number(index)];
  return round.legs === 2
    ? { competition, label: round.label, leg: second ? 2 : 1 }
    : { competition, label: round.label };
}

/**
 * The domestic cups and continental competitions of a `code`-founded club's season in each of
 * `YEARS`, every round played and drawn; on the pre-feature path, since the stages, not the match
 * model, are the subject.
 */
function seasonsOf(code: CountryCode) {
  return cachedWorld(`stage-seasons-${code}`, () => {
    const baseline = createWorld(
      {
        country: code,
        name: 'Stage Rovers',
        seed: `stages-${code}`,
        color: '#224433',
        level: 'normal' as const,
      },
      DISABLED_RELEASE,
    );
    return YEARS.map((year) => {
      // Each is a fresh synthetic epoch, not thirteen jumps through one retained career.
      const w = structuredClone(baseline);
      delete w.people;
      w.year = year;
      w.manager.since = year;
      w.manager.until = year + 3;
      for (const player of w.players) {
        player.born = year - 24;
        player.joined = year;
        player.until = year + 2;
      }
      w.currency = currency(code, year).code;
      w.priceIndex = priceIndex(code, year).value;
      prepareSeason(w);
      finishCups(w);
      finishEurope(w);
      return { year, cups: w.cups!, europe: w.europe };
    });
  });
}

describe('cup stages from fixture IDs', () => {
  it.each(['ENG', 'GER', 'BEL'] as CountryCode[])(
    'names every %s-founded season knockout and phase match as its live round did',
    (code) => {
      const seen = new Set<string>();
      for (const { year, cups, europe } of seasonsOf(code)) {
        for (const cup of cups)
          for (const f of cup.fixtures) {
            expect(knockoutStage(f), f.id).toEqual(liveStage('cup', cup.rounds, f));
            expect(knockoutStage(f, year)).toEqual(knockoutStage(f));
          }
        for (const t of europe)
          for (const f of t.fixtures) {
            const stage = knockoutStage(f, year)!;
            seen.add(stage.label);
            if (/:(phase|second):/.test(f.id))
              expect(stage, f.id).toEqual({
                competition: t.key,
                label: f.id.includes(':second:')
                  ? '2차 조별 리그'
                  : t.format === 'league'
                    ? '리그 페이즈'
                    : '조별 리그',
                phase: true,
              });
            else expect(stage, f.id).toEqual(liveStage(t.key, t.rounds!, f));
          }
        for (const cup of cups) for (const round of cup.rounds) seen.add(round.label);
      }
      expect([...seen].sort()).toEqual(
        [
          '1라운드',
          '64강',
          '32강',
          '16강',
          '8강',
          '4강',
          '결승',
          '예선 1라운드',
          '예선 2라운드',
          '플레이오프',
          '리그 페이즈',
          '조별 리그',
          '2차 조별 리그',
        ].sort(),
      );
    },
  );

  it('opens every domestic cup with 1라운드: no field, with or without our club, is a power of two', () => {
    for (const c of COUNTRIES) {
      const field = c.groups.flat().reduce((sum, size) => sum + size, 0) + AMATEUR_CLUBS;
      for (const n of [field, field + 1]) expect(n & (n - 1), `${c.code} ${n}`).not.toBe(0);
    }
  });

  it('leaves league, play-off and unknown fixtures without a cup stage', () => {
    for (const id of [
      '1987:ENG:0:0:3:4',
      '1987:barrage:ENG:1',
      '1987:lower-promotion:0:0',
      '1950:ucl:k0:0',
      '1950:ucl:phase:0',
      '1987:cup:ENG:k1:0:2',
    ])
      expect(knockoutStage({ id, round: 43 }), id).toBeUndefined();
    // A round off its competition's calendar is no cup round.
    expect(knockoutStage({ id: '1987:cup:ENG:k2:0', round: 17 })).toBeUndefined();
    expect(knockoutStage({ id: '1987:ucl:k2:0', round: 17 })).toBeUndefined();
    expect(knockoutStage({ id: '1987:ucl:k4:0', round: 43 })).toEqual({
      competition: 'ucl',
      label: '결승',
    });
    expect(knockoutStage({ id: '1987:ucl:k3:1:2', round: 38 })).toEqual({
      competition: 'ucl',
      label: '4강',
      leg: 2,
    });
  });

  it('keeps the stage of matches archived on the calendar before rules 1.14.0', () => {
    const stage = (id: string, round: number) => knockoutStage({ id, round })?.label;
    // Knockout-only eras: the round of the draw, on the old ladder (a return a round later).
    expect(stage('1987:ucl:k3:1:2', 40)).toBe('4강');
    expect(stage('1985:uel:k1:0', 9)).toBe('32강');
    expect(stage('1985:uel:k1:0', 12)).toBe('32강');
    expect(stage('1985:uel:k1:0:2', 10)).toBe('32강');
    expect(stage('1985:uel:k1:0:2', 14)).toBe('32강');
    // After a phase: the old quarter-final first leg (round 36) is no semi-final now.
    expect(stage('1996:ucl:k0:0', 36)).toBe('8강');
    expect(stage('1996:ucl:k0:0', 31)).toBe('8강');
    expect(stage('1996:ucl:k1:0', 38)).toBe('4강');
    expect(stage('2010:ucl:k0:0:2', 33)).toBe('16강');
    expect(stage('2010:ucl:k0:0:2', 32)).toBe('16강');
    expect(stage('2010:ucl:k0:0', 29)).toBe('16강');
  });
});
