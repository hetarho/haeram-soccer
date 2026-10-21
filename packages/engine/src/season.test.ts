import { describe, expect, it } from 'vitest';
import { cachedWorld, simulatedWorld, withCandidateModel } from '../../../tests/fixtures/worlds';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { Fixture, MatchPlayback, World } from '../../contracts/src/types';
import { simulateAggregate } from './aggregate/engine';
import { nextOwnFixture } from './calendar';
import { playGrid } from './grid/engine';
import { buildGridSetup, type DecideRule } from './grid/setup';
import { closeSeason, eloOf, ownLeagueClubs, simulateSeason } from './index';
import { playFixture, tieRule } from './knockout';
import { OWN_LEAGUE_ENGINE, setOwnLeagueEngine, simulateMatch } from './match';
import { appearanceForFixture } from './match-appearance';
import { MATCH_MODEL_RELEASE, validateFullMatchRecord } from './match-model';
import { npcCompetition, playerTotals } from './npc-stats';
import { advanceDays, advanceRound, advanceToNextMatch, recordMatch, resolveTie } from './season';
import { archiveLastRound, closedSeason, founded } from './season.testkit';

describe('closed season archive', () => {
  it.each(['amateur', 'professional'] as const)(
    'keeps the %s league scorers, the rank after every round and the Elo spread',
    (start) => {
      const { w, live, season } = closedSeason(archiveLastRound(start));
      const scorers = season.scorers!;
      const table = live.scorerSeason!.players.filter((p) => p.goals > 0);
      expect(scorers).toHaveLength(Math.min(10, table.length));
      expect(scorers.length).toBeGreaterThan(0);
      scorers.forEach((scorer, i) => {
        expect(scorer.club).toBeGreaterThanOrEqual(0);
        expect(scorer.club).toBeLessThan(w.clubs.length);
        expect(table).toContainEqual(
          expect.objectContaining({ ...scorer, club: w.clubs[scorer.club].id }),
        );
        const next = scorers[i + 1];
        if (next)
          expect(
            scorer.goals > next.goals ||
              (scorer.goals === next.goals && scorer.appearances <= next.appearances),
          ).toBe(true);
      });
      // Nobody left out scored more than the last one kept.
      expect(table.filter((p) => p.goals > scorers.at(-1)!.goals).length).toBeLessThan(
        scorers.length,
      );

      // One rank per settled round, read from the snapshots the live rank graph draws.
      const snapshots = w
        .rankHistory!.filter(
          (s) =>
            s.year === season.year &&
            s.round > 0 &&
            s.tier === season.tier &&
            s.group === season.group,
        )
        .sort((a, b) => a.round - b.round);
      expect(season.ranks).toHaveLength(46);
      expect(season.ranks).toEqual(
        snapshots.map((s) => s.rows.findIndex(([i]) => w.clubs[i].id === w.playerClub) + 1),
      );
      expect(season.ranks!.at(-1)).toBe(season.rank);

      const world = live.clubs.map(eloOf),
        league = ownLeagueClubs(live).map(eloOf);
      expect(season.eloRange).toEqual(
        [Math.min(...world), Math.max(...world), Math.min(...league), Math.max(...league)].map(
          Math.round,
        ),
      );
      const [low, high, leagueLow, leagueHigh] = season.eloRange!;
      expect(low).toBeLessThanOrEqual(leagueLow);
      expect(leagueLow).toBeLessThanOrEqual(season.elo!);
      expect(season.elo!).toBeLessThanOrEqual(leagueHigh);
      expect(leagueHigh).toBeLessThanOrEqual(high);
      // Decoding keeps every archived field.
      expect(canonical(validateWorld(structuredClone(w)))).toBe(canonical(w));
    },
  );

  it('rejects archived bracket rows and scorers that point nowhere or contradict their legs', () => {
    const { w, season } = closedSeason(archiveLastRound('amateur'));
    const corruptions: ((row: number[]) => void)[] = [
      (row) => (row[0] = w.clubs.length),
      (row) => (row[1] = w.clubs.length),
      (row) => (row[1] = row[0]),
      (row) => (row[6] = 6),
      // A single match has no second leg and no away goals.
      (row) => (row[4] = 1),
      (row) => (row[6] = 4),
    ];
    expect(season.brackets![0].rounds[0].legs).toBe(1);
    for (const corrupt of corruptions) {
      const copy = structuredClone(w);
      corrupt(copy.history[0].brackets![0].rounds[0].ties[0]);
      expect(() => validateWorld(copy)).toThrow('대진 기록 참조 손상');
    }
    const bye = structuredClone(w);
    bye.history[0].brackets![0].rounds[0].byes = [w.clubs.length];
    expect(() => validateWorld(bye)).toThrow('대진 기록 참조 손상');
    const short = structuredClone(w);
    short.history[0].brackets![0].rounds[0].ties[0].pop();
    expect(() => validateWorld(short)).toThrow();
    const scorer = structuredClone(w);
    scorer.history[0].scorers![0].club = w.clubs.length;
    expect(() => validateWorld(scorer)).toThrow('시즌 득점 기록 참조 손상');
    const spread = structuredClone(w);
    const [low, high, leagueLow, leagueHigh] = season.eloRange!;
    spread.history[0].eloRange = [leagueLow + 1, high, leagueLow, leagueHigh];
    expect(() => validateWorld(spread)).toThrow();
    expect(low).toBeLessThanOrEqual(leagueLow);
  });
});

describe('league settlement appearance (→KIT-12)', () => {
  it('captures the own league result, observed or not, and nothing for other matches', () => {
    const base = simulatedWorld({
      country: 'ENG',
      name: 'Design Town',
      color: '#223344',
      seed: 'identity-command',
      level: 'normal',
    });
    const next = nextOwnFixture(base)!;
    const expected = appearanceForFixture(base, next);
    for (const observe of [true, false]) {
      const w = structuredClone(base);
      let live: MatchPlayback | undefined;
      advanceRound(w, (_, p) => (live = p), observe);
      expect(live!.record.id).toBe(next.id);
      expect(live!.frames.length > 0).toBe(observe);
      expect(live!.record.appearance).toEqual(expected);
      expect(w.ownMatches.find((m) => m.id === next.id)!.appearance).toEqual(expected);
      // The round's other matches leave no appearance anywhere in the world.
      expect(canonical(w).split('"appearance":').length - 1).toBe(w.ownMatches.length);
    }
  });
});

const isOwn = (w: World, f: Fixture) => f.home === w.playerClub || f.away === w.playerClub;
/** A 2024 world (substitutes, cups and Europe) on the candidate model from its founding. */
const candidate = () => withCandidateModel(founded(2024));
/** The candidate world seven rounds in, by rounds: league days, a cup round and a Europe day. */
const sevenRounds = () =>
  cachedWorld('candidate-2024-seven-rounds', () => {
    const w = withCandidateModel(founded(2024));
    while (w.round < 7) advanceRound(w, undefined, false);
    return w;
  });
/** Every scheduled fixture of the season: league, cups and Europe. */
const scheduled = (w: World) => [
  ...w.fixtures,
  ...(w.cups ?? []).flatMap((c) => c.fixtures),
  ...w.europe.flatMap((t) => t.fixtures),
];
/** A promotion playoff tie between two clubs nobody owns, as `promote` draws one. */
function playoff(w: World): Fixture {
  const [home, away] = w.clubs.filter(
    (c) => c.country === 'ENG' && c.tier === 1 && !c.representative,
  );
  return {
    id: `${w.year}:promotion:ENG:0:0:0`,
    year: w.year,
    round: 46,
    kind: 'playoff',
    home: home!.id,
    away: away!.id,
    country: 'ENG',
    groupKey: 'promotion:ENG:0',
  };
}
/**
 * The revision counts commands and days differently per mode; it is a counter, not a fact. A
 * critical alert stops day steps until it is acknowledged, while round and season steps carry on
 * past it, so the comparison leaves it out.
 */
const facts = (w: World) => canonical({ ...w, critical: undefined, revision: 0, receiptIds: [] });

describe('candidate model dispatch and settlement (→MATCH-22, MATCH-27, HIST-17)', () => {
  it('dispatches every non-own competition to aggregate', () => {
    const w = candidate();
    const plain = founded(2024);
    const cup = w.cups!.find((c) => c.fixtures.some((f) => !isOwn(w, f)))!;
    const cupTie = cup.fixtures.find((f) => !isOwn(w, f))!;
    const others: [Fixture, DecideRule | undefined][] = [
      [w.fixtures.find((f) => f.kind === 'league' && !isOwn(w, f))!, undefined],
      [w.fixtures.find((f) => f.kind === 'lower' && !isOwn(w, f))!, undefined],
      [cupTie, tieRule(cupTie, cup.fixtures, false)],
      [w.europe[0]!.fixtures[0]!, undefined],
      [playoff(w), { awayGoals: false }],
    ];
    for (const [f, decide] of others) {
      const expected = simulateAggregate(w, f, decide).record;
      expect(validateFullMatchRecord(expected)).toEqual([]);
      // Watching, the lines asked for and the measurement switch never change the path.
      for (const observe of [false, true])
        for (const keep of [false, true]) {
          const p = simulateMatch(w, f, observe, keep, decide);
          expect(p.record).toEqual(expected);
          expect(p.frames).toEqual([]);
        }
      setOwnLeagueEngine('grid');
      try {
        expect(simulateMatch(w, f, true, true, decide).record).toEqual(expected);
      } finally {
        setOwnLeagueEngine(OWN_LEAGUE_ENGINE);
      }
      // A world that never activated keeps its settled model.
      expect(simulateMatch(plain, f, false, true, decide).record.model).toBeUndefined();
    }
    const ownCup = (w.cups ?? []).flatMap((c) => c.fixtures).find((f) => isOwn(w, f))!;
    const owns: [Fixture, DecideRule | undefined][] = [
      [w.fixtures.find((f) => isOwn(w, f))!, undefined],
      [ownCup, { awayGoals: false }],
    ];
    for (const [f, decide] of owns) {
      const quiet = simulateMatch(w, f, false, false, decide);
      const watched = simulateMatch(w, f, true, true, decide);
      const detailed = playGrid(
        buildGridSetup(w, f, { observe: false, recordPlayers: true, ...(decide && { decide }) }),
      ).record;
      expect(quiet.record).toEqual(detailed);
      expect(watched.record).toEqual(quiet.record);
      expect(quiet.frames).toEqual([]);
      expect(watched.frames.length).toBeGreaterThan(0);
      // Every named participant of both sides, with his advanced counters.
      expect(validateFullMatchRecord(quiet.record)).toEqual([]);
      expect(quiet.record.lineCounts![0]).toBeGreaterThanOrEqual(11);
      expect(quiet.record.lineCounts![1]).toBeGreaterThanOrEqual(11);
      expect(simulateMatch(plain, f, false, true, decide).record.model).toBeUndefined();
    }
    // Through the season's own paths every competition reaches the ledger; the switch stays off.
    const s = sevenRounds();
    expect([...new Set(s.npcSeason!.competitions.map((c) => c.kind))].sort()).toEqual([
      'cup',
      'europe',
      'league',
      'lower',
    ]);
    expect(() => validateWorld(s)).not.toThrow();
    const tie = playoff(s);
    resolveTie(s, tie);
    expect(npcCompetition(s.npcSeason, tie)!.clubs.map((c) => [c.club, c.matches])).toEqual([
      [tie.home, 1],
      [tie.away, 1],
    ]);
    expect(MATCH_MODEL_RELEASE.enabled).toBe(false);
    expect(plain.matchModel).toBeUndefined();
  });

  it('settles a fixture once', () => {
    const w = sevenRounds();
    // Each club's matches in each scope are its scored fixtures there, every one counted once.
    const counts = new Map<string, number>();
    for (const f of scheduled(w))
      if (f.score)
        for (const club of [f.home, f.away]) {
          const key = `${f.kind}|${f.groupKey}|${club}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
    const ledger = new Map(
      w.npcSeason!.competitions.flatMap((c) =>
        c.clubs.map((row) => [`${c.kind}|${c.groupKey}|${row.club}`, row.matches] as const),
      ),
    );
    expect(ledger).toEqual(counts);
    // A settled fixture is never played again, and an own result already saved is a no-op.
    const before = canonical(w);
    for (const f of scheduled(w)
      .filter((f) => f.score && f.kind !== 'league')
      .slice(0, 20))
      expect(playFixture(w, f)).toBeUndefined();
    const saved = w.ownMatches.at(-1)!;
    const fixture = scheduled(w).find((f) => f.id === saved.id)!;
    recordMatch(w, simulateMatch(w, fixture), fixture.kind !== 'cup');
    expect(canonical(w)).toBe(before);
    // Reading the stats and watching the own match change nothing, now or in later draws.
    const read = structuredClone(w);
    for (const c of read.npcSeason!.competitions) for (const p of c.players) playerTotals(p);
    expect(npcCompetition(read.npcSeason, fixture)).toBeDefined();
    expect(canonical(read)).toBe(before);
    const watched = advanceToNextMatch(read);
    const quiet = advanceToNextMatch(w, undefined, false);
    expect(watched!.frames.length).toBeGreaterThan(0);
    expect(quiet!.record).toEqual(watched!.record);
    expect(canonical(read)).toBe(canonical(w));
  });

  it('keeps day round and season advancement equivalent', () => {
    // Midseason: day steps reach round 7 through the cup and Europe days as rounds do.
    const days = candidate();
    while (days.round < 7) advanceDays(days, 1, undefined, false);
    expect(facts(days)).toBe(facts(sevenRounds()));
    // Across the close: activated two rounds before it, then day, round and season commands.
    const late = cachedWorld('late-2024', () => {
      const w = founded(2024);
      while (w.round < 44) advanceRound(w, undefined, false);
      return w;
    });
    const start = withCandidateModel(late);
    const year = start.year;
    const done = (w: World) => w.year > year && w.round === 1;
    const byDays = structuredClone(start);
    while (!done(byDays)) {
      advanceDays(byDays, 1, undefined, false);
      // The close's alert (here a departing manager) is acknowledged, as the owner would.
      delete byDays.critical;
    }
    const byRounds = structuredClone(start);
    while (!done(byRounds)) {
      if (byRounds.round >= 46) {
        closeSeason(byRounds);
        byRounds.revision++;
      }
      advanceRound(byRounds, undefined, false);
    }
    const bySeason = structuredClone(start);
    simulateSeason(bySeason);
    advanceRound(bySeason, undefined, false);
    expect(facts(byRounds)).toBe(facts(byDays));
    expect(facts(bySeason)).toBe(facts(byDays));
    // The activation boundary stays; the new season's aggregates start whole and count round 1.
    expect(byDays.matchModel!.trackedFrom).toEqual({ year, day: 309, round: 45 });
    expect(byDays.npcSeason!.year).toBe(year + 1);
    expect(byDays.npcSeason!.trackedFrom).toEqual({ year: year + 1, day: 1, round: 1 });
    expect(byDays.npcSeason!.competitions.length).toBeGreaterThan(0);
    expect(() => validateWorld(byDays)).not.toThrow();
  });
});
