import { describe, expect, it } from 'vitest';
import type { CountryCode, KnockoutRound, World } from '../../../../packages/contracts/src/types';
import {
  advanceRound,
  closeSeason,
  cupKey,
  finishCups,
  finishEurope,
  fixtureDate,
  legsOf,
  tieAggregate,
} from '../../../../packages/engine/src/index';
import { careerWorld } from '../../../../packages/engine/src/career.testkit';
import { cachedWorld } from '../../../../tests/fixtures/cached-world';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/releases';
import { archivedKnockout, treeColumns, treeStart, type TreeColumn } from './bracketTree';

/** The bracket club on the pre-feature path: the knockout tree, not the match model, is the subject. */
function founded(country: CountryCode, year?: number) {
  return careerWorld(
    { country, seed: `bracket-tree-${country}`, ...(year ? { year } : {}) },
    DISABLED_RELEASE,
  );
}

/** The career (as `founded` makes it) with its cups or continental cups played to the end. */
const finished = (country: CountryCode, competitions: 'cups' | 'europe', year?: number) =>
  cachedWorld(`${competitions}-${country}-${year}`, () => {
    const w = founded(country, year);
    if (competitions === 'cups') finishCups(w);
    else finishEurope(w);
    return w;
  });

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
      const w = finished(code, 'cups');
      const rounds = w.cups!.find((cup) => cup.country === code)!.rounds;
      // Every professional club enters (→LEAGUE-5) and the first round brings the field to the
      // power of two below it: 64 from England's four divisions, 32 from the three of Germany and
      // France. That first round, and a round of 64, stay off the tree.
      const [first] = rounds,
        entered = first.ties.length * 2 + (first.byes?.length ?? 0),
        field = first.ties.length + (first.byes?.length ?? 0);
      expect(entered).toBe(
        w.clubs.filter((club) => club.country === code && !club.id.startsWith('euro:')).length,
      );
      expect(field & (field - 1)).toBe(0);
      expect(field).toBeLessThan(entered);
      expect(field).toBeGreaterThanOrEqual(32);
      const halvings = Array.from({ length: Math.log2(field) }, (_, i) => field / 2 ** i);
      expect(rounds.map((round) => round.label)).toEqual([
        '1라운드',
        ...halvings.map((clubs) => (clubs === 2 ? '결승' : `${clubs}강`)),
      ]);
      const last32 = rounds.findIndex((round) => round.label === '32강');
      for (let drawn = 1; drawn <= last32; drawn++) {
        expect(treeColumns(rounds.slice(0, drawn))).toBeUndefined();
        expect(treeStart(rounds.slice(0, drawn))).toBe(-1);
      }
      expect(shape(treeColumns(rounds.slice(0, last32 + 1)))).toEqual([
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
    const w = finished('ENG', 'europe', 2024);
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
    const w = finished('ENG', 'europe', 1991);
    const rounds = w.europe.find((t) => t.key === 'ucl')!.rounds!;
    expect(rounds.map((round) => round.label)).toEqual(['예선 1라운드', '예선 2라운드', '결승']);
    expect(treeColumns(rounds.slice(0, 2))).toBeUndefined();
    expect(shape(treeColumns(rounds))).toEqual([{ label: '결승', ties: 1, byes: 0, open: 0 }]);
  });

  it('rebuilds a closed 1980 season from its archived brackets with the same winners', () => {
    // The season played up to its close; the close itself runs here.
    const w = cachedWorld('eng-1980-before-close', () => {
      const w = founded('ENG', 1980);
      while (w.round < 46) advanceRound(w, undefined, false);
      return w;
    });
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
