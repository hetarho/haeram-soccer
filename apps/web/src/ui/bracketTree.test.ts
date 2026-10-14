import { describe, expect, it } from 'vitest';
import type { CountryCode, KnockoutRound, World } from '../../../../packages/contracts/src/types';
import { currency, priceIndex } from '../../../../packages/catalogs/src/index';
import {
  advanceRound,
  closeSeason,
  createWorld,
  cupKey,
  finishCups,
  finishEurope,
  fixtureDate,
  legsOf,
  prepareSeason,
  tieAggregate,
} from '../../../../packages/engine/src/index';
import { archivedKnockout, treeColumns, treeStart, type TreeColumn } from './bracketTree';

function founded(country: CountryCode, year?: number) {
  const w = createWorld({
    country,
    name: 'Bracket Rovers',
    color: '#2a4d3a',
    seed: `bracket-tree-${country}`,
    level: 'normal' as const,
  });
  if (!year) return w;
  w.year = year;
  w.currency = currency(country, year).code;
  w.priceIndex = priceIndex(country, year).value;
  w.manager.since = year;
  w.manager.until = year + 3;
  for (const p of w.players) {
    p.born = year - 24;
    p.until = year + 2;
  }
  prepareSeason(w);
  return w;
}

/** Each column's label with its drawn ties, byes and slots still to be drawn. */
const shape = (columns: TreeColumn[] | undefined) =>
  columns?.map((column) => ({
    label: column.label,
    ties: column.slots.filter((slot) => slot && 'tie' in slot).length,
    byes: column.slots.filter((slot) => slot && 'bye' in slot).length,
    open: column.slots.filter((slot) => !slot).length,
  }));

describe('knockout tree', () => {
  it.each(['GER', 'FRA', 'ENG'] as CountryCode[])(
    'keeps the %s cup a list until the last 32, then draws 32강 to 결승',
    (code) => {
      const w = founded(code);
      finishCups(w);
      const rounds = w.cups!.find((cup) => cup.country === code)!.rounds;
      // A mass first round (8 ties and 56 byes in Germany) and the round of 64 stay off the tree.
      expect(rounds.map((round) => round.label).slice(0, 3)).toEqual(['1라운드', '64강', '32강']);
      for (const drawn of [1, 2]) {
        expect(treeColumns(rounds.slice(0, drawn))).toBeUndefined();
        expect(treeStart(rounds.slice(0, drawn))).toBe(-1);
      }
      expect(shape(treeColumns(rounds.slice(0, 3)))).toEqual([
        { label: '32강', ties: 16, byes: 0, open: 0 },
        { label: '16강', ties: 0, byes: 0, open: 8 },
        { label: '8강', ties: 0, byes: 0, open: 4 },
        { label: '4강', ties: 0, byes: 0, open: 2 },
        { label: '결승', ties: 0, byes: 0, open: 1 },
      ]);
      expect(shape(treeColumns(rounds))).toEqual(
        [16, 8, 4, 2, 1].map((ties, i) => ({
          label: ['32강', '16강', '8강', '4강', '결승'][i],
          ties,
          byes: 0,
          open: 0,
        })),
      );
    },
  );

  it('puts the 2024 play-off and its byes before the round of 16', () => {
    const w = founded('ENG', 2024);
    finishEurope(w);
    const rounds = w.europe.find((t) => t.key === 'ucl')!.rounds!;
    // Drawn after the league phase: eight ties, eight seeds waiting, the rest to come.
    expect(shape(treeColumns(rounds.slice(0, 1)))).toEqual([
      { label: '플레이오프', ties: 8, byes: 8, open: 0 },
      { label: '16강', ties: 0, byes: 0, open: 8 },
      { label: '8강', ties: 0, byes: 0, open: 4 },
      { label: '4강', ties: 0, byes: 0, open: 2 },
      { label: '결승', ties: 0, byes: 0, open: 1 },
    ]);
    expect(shape(treeColumns(rounds))).toEqual([
      { label: '플레이오프', ties: 8, byes: 8, open: 0 },
      { label: '16강', ties: 8, byes: 0, open: 0 },
      { label: '8강', ties: 4, byes: 0, open: 0 },
      { label: '4강', ties: 2, byes: 0, open: 0 },
      { label: '결승', ties: 1, byes: 0, open: 0 },
    ]);
  });

  it('skips the 1991 qualifying rounds: the final alone is the tree', () => {
    const w = founded('ENG', 1991);
    finishEurope(w);
    const rounds = w.europe.find((t) => t.key === 'ucl')!.rounds!;
    expect(rounds.map((round) => round.label)).toEqual(['예선 1라운드', '예선 2라운드', '결승']);
    expect(treeColumns(rounds.slice(0, 2))).toBeUndefined();
    expect(shape(treeColumns(rounds))).toEqual([{ label: '결승', ties: 1, byes: 0, open: 0 }]);
  });

  it('rebuilds a closed 1980 season from its archived brackets with the same winners', () => {
    const w = founded('ENG', 1980);
    while (w.round < 46) advanceRound(w, undefined, false);
    const live = structuredClone(w);
    finishCups(live);
    finishEurope(live);
    closeSeason(w);
    expect(w.year).toBe(1981);
    const season = w.history.at(-1)!;
    const cup = live.cups!.find((entry) => entry.country === 'ENG')!;
    const sources: Record<
      string,
      { id: string; rounds: KnockoutRound[]; fixtures: World['fixtures'] }
    > = {
      cup: { id: cupKey('ENG'), rounds: cup.rounds, fixtures: cup.fixtures },
      ...Object.fromEntries(
        live.europe.map((t) => [t.key, { id: t.key, rounds: t.rounds!, fixtures: t.fixtures }]),
      ),
    };
    expect(season.brackets!.map((bracket) => bracket.key).sort()).toEqual(
      ['cup', 'cwc', 'ucl', 'uel'].sort(),
    );
    for (const bracket of season.brackets!) {
      const source = sources[bracket.key];
      const rebuilt = archivedKnockout(w, season.year, bracket);
      expect(rebuilt.competition).toBe(source.id);
      const skipped = source.rounds.length - rebuilt.rounds.length;
      rebuilt.rounds.forEach((round, r) => {
        const kept = source.rounds[skipped + r];
        expect({ ...round, ties: undefined }).toEqual({ ...kept, ties: undefined });
        round.ties.forEach((tie, t) => {
          expect(tie).toEqual(kept.ties[t]);
          const legs = legsOf(w, rebuilt.fixtures, rebuilt.competition, r, t, season.year),
            played = legsOf(w, source.fixtures, source.id, skipped + r, t, season.year);
          expect(legs.map((f) => [f.home, f.away, f.score, f.kind])).toEqual(
            played.map((f) => [f.home, f.away, f.score, f.kind]),
          );
          expect(legs.map((f) => fixtureDate(w, f))).toEqual(played.map((f) => fixtureDate(w, f)));
          expect(tieAggregate(tie, legs)).toEqual(tieAggregate(kept.ties[t], played));
        });
      });
      // Every archived bracket opens as a whole tree from its first kept round.
      expect(shape(treeColumns(rebuilt.rounds))?.map((column) => column.label)).toEqual(
        rebuilt.rounds.map((round) => round.label),
      );
    }
  });
});
